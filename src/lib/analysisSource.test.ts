import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AnalysisCancelledError,
  AnalysisUnavailableError,
  CLIENT_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  post,
} from "./analysisSource";

/** A fetch that never answers, but honours its abort signal like the real one. */
const hanging = ((_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    if (init?.signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })) as typeof fetch;

test("the client waits longer than the slowest route can run", async () => {
  // The exact bound is checked against the server constants in geminiClient.test.ts.
  // Every route's maxDuration, read from the route files: the browser must wait longer.
  const { readFileSync, readdirSync } = await import("node:fs");
  for (const route of readdirSync("src/app/api")) {
    const declared = Number(/export const maxDuration = (\d+);/.exec(readFileSync(`src/app/api/${route}/route.ts`, "utf8"))?.[1]);
    assert.ok(declared > 0 && CLIENT_TIMEOUT_MS > declared * 1000, route);
  }
});

test("a request that never answers ends with a timeout message", async () => {
  await assert.rejects(
    post("/api/x", {}, { fetchImpl: hanging, timeoutMs: 30 }),
    (error: unknown) => error instanceof AnalysisUnavailableError && error.message === TIMEOUT_MESSAGE,
  );
});

test("cancelling is reported as a cancel, not as a failure or a timeout", async () => {
  const controller = new AbortController();
  const pending = post("/api/x", {}, { fetchImpl: hanging, signal: controller.signal, timeoutMs: 10_000 });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof AnalysisCancelledError);
});

test("an already-cancelled signal never reaches the network as a live request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    post("/api/x", {}, { fetchImpl: hanging, signal: controller.signal }),
    (error: unknown) => error instanceof AnalysisCancelledError,
  );
});

test("server errors keep the route's own message", async () => {
  const failing = (async () =>
    new Response(JSON.stringify({ error: "과제 지문이 너무 깁니다." }), { status: 413 })) as typeof fetch;
  await assert.rejects(post("/api/x", {}, { fetchImpl: failing }), /과제 지문이 너무 깁니다/);
});

test("a successful response is returned as JSON", async () => {
  const ok = (async () => new Response(JSON.stringify({ value: 1 }), { status: 200 })) as typeof fetch;
  assert.deepEqual(await post<{ value: number }>("/api/x", {}, { fetchImpl: ok }), { value: 1 });
});
