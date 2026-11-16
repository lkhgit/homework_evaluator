import assert from "node:assert/strict";
import { test } from "node:test";

import { createPreviewRequests } from "./previewRequests";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness() {
  const calls: string[] = [];
  const pending = new Map<string, ReturnType<typeof deferred<string>>>();
  const results: Array<[string, string]> = [];
  const errors: string[] = [];
  const requests = createPreviewRequests<string>(
    (key) => {
      calls.push(key);
      const next = deferred<string>();
      pending.set(key, next);
      return next.promise;
    },
    {
      onResult: (key, value) => results.push([key, value]),
      onError: (key) => errors.push(key),
    },
  );
  return { calls, pending, results, errors, requests };
}

test("asking again for the same key while it runs reuses the request", async () => {
  const { calls, pending, results, requests } = harness();
  const first = requests.ensure("k1");
  // Leaving the preview and returning, a re-render, or a StrictMode
  // double-invoke all land here.
  const second = requests.ensure("k1");
  assert.equal(first, second);
  assert.deepEqual(calls, ["k1"]);
  pending.get("k1")!.resolve("rewrite");
  assert.equal(await second, "rewrite");
  assert.deepEqual(results, [["k1", "rewrite"]]);
  assert.equal(requests.isPending("k1"), false);
});

test("a result arriving after the screen was left is still delivered", async () => {
  const { pending, results, requests } = harness();
  requests.ensure("k1");
  // Nobody awaits it any more; the paid result must still be kept.
  pending.get("k1")!.resolve("rewrite");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(results, [["k1", "rewrite"]]);
});

test("different keys are independent, and an older one finishing later keeps its own key", async () => {
  const { calls, pending, results, requests } = harness();
  requests.ensure("old");
  requests.ensure("new");
  assert.deepEqual(calls, ["old", "new"]);
  pending.get("new")!.resolve("new rewrite");
  pending.get("old")!.resolve("old rewrite");
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Each result is stored under its own key; staleness is decided by the key.
  assert.deepEqual(results, [["new", "new rewrite"], ["old", "old rewrite"]]);
});

test("a failure is reported once and a retry makes a new request", async () => {
  const { calls, pending, errors, requests } = harness();
  requests.ensure("k1");
  pending.get("k1")!.reject(new Error("boom"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(errors, ["k1"]);
  requests.ensure("k1");
  assert.deepEqual(calls, ["k1", "k1"]);
});
