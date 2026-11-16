import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import { REQUEST_LIMITS, parseBoundedRequest, readJsonBody } from "./requestLimits";
import {
  analysisRequestSchema,
  objectiveRequestSchema,
  previewRequestSchema,
  repairClassificationRequestSchema,
} from "./schema";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

test("a declared Content-Length over the limit is refused before reading", async () => {
  const result = await readJsonBody(post("{}", { "content-length": String(REQUEST_LIMITS.bodyBytes + 1) }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("a body that grows past the limit while streaming is refused", async () => {
  const result = await readJsonBody(post(JSON.stringify({ x: "a".repeat(2048) })), 1024);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 413);
});

test("malformed JSON is a 400, not a crash", async () => {
  const result = await readJsonBody(post("{not json"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("an assignment over the character limit gets a 413 naming the field and limit", async () => {
  const text = "가".repeat(REQUEST_LIMITS.assignmentChars + 1);
  const result = await parseBoundedRequest(post(JSON.stringify({ assignmentText: text })), objectiveRequestSchema, "fallback");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 413);
  assert.match(result.error, /과제 지문이 너무 깁니다/);
  assert.match(result.error, /30,000자/);
});

test("an over-long objective, suggestion or repair list is rejected", async () => {
  const objective = "x".repeat(REQUEST_LIMITS.objectiveChars + 1);
  const analyze = await parseBoundedRequest(
    post(JSON.stringify({ assignmentText: BIOLOGY_TEXT, lockedObjective: objective })),
    analysisRequestSchema,
    "fallback"
  );
  assert.equal(analyze.ok, false);
  if (!analyze.ok) assert.match(analyze.error, /학습 목표가 너무 깁니다/);

  const repair = { action: "a", suggestion: "b", rigorNote: "c" };
  const preview = await parseBoundedRequest(
    post(JSON.stringify({
      assignmentText: BIOLOGY_TEXT,
      lockedObjective: "goal",
      repairs: Array.from({ length: REQUEST_LIMITS.repairs + 1 }, () => repair),
    })),
    previewRequestSchema,
    "fallback"
  );
  assert.equal(preview.ok, false);
  if (!preview.ok) assert.match(preview.error, /개선안 목록/);

  const classify = await parseBoundedRequest(
    post(JSON.stringify({
      lockedObjective: "goal",
      analysis: BIOLOGY_SAMPLE.analysis,
      stepId: "s4",
      suggestion: "y".repeat(REQUEST_LIMITS.suggestionChars + 1),
    })),
    repairClassificationRequestSchema,
    "fallback"
  );
  assert.equal(classify.ok, false);
  if (!classify.ok) assert.match(classify.error, /개선안/);
});

test("valid requests within limits still parse, and missing fields keep the route's message", async () => {
  const ok = await parseBoundedRequest(
    post(JSON.stringify({ assignmentText: BIOLOGY_TEXT, lockedObjective: BIOLOGY_SAMPLE.analysisObjective })),
    analysisRequestSchema,
    "fallback"
  );
  assert.equal(ok.ok, true);

  const classify = await parseBoundedRequest(
    post(JSON.stringify({ lockedObjective: "goal", analysis: BIOLOGY_SAMPLE.analysis, stepId: "s4", suggestion: "Keep values on screen." })),
    repairClassificationRequestSchema,
    "fallback"
  );
  assert.equal(classify.ok, true);

  const missing = await parseBoundedRequest(post(JSON.stringify({})), objectiveRequestSchema, "route message");
  assert.deepEqual(missing, { ok: false, status: 400, error: "route message" });
});
