import assert from "node:assert/strict";
import { test } from "node:test";

import { describeModelFailure } from "./gemini";

/** Shaped like @google/genai's ApiError: status plus a message. */
function apiError(status: number, message: string) {
  return { status, message };
}

test("an exhausted free-tier quota says so instead of blaming the network", () => {
  const failure = describeModelFailure(apiError(429, "RESOURCE_EXHAUSTED: Quota exceeded"));
  assert.equal(failure.status, 429);
  assert.match(failure.message, /무료 Gemini API 사용 한도/);
});

test("a missing or invalid key is reported as configuration, not as a retry", () => {
  const failure = describeModelFailure(apiError(400, "API key not valid. Please pass a valid API key."));
  assert.equal(failure.status, 500);
  assert.match(failure.message, /API 키/);
});

test("a bare 401/403 is also treated as a configuration problem", () => {
  assert.equal(describeModelFailure(apiError(401, "unauthenticated")).status, 500);
  assert.equal(describeModelFailure(apiError(403, "permission denied")).status, 500);
});

test("a retired or misspelled model is named as a configuration problem, not a network error", () => {
  const failure = describeModelFailure(
    apiError(404, "This model models/gemini-2.5-flash-lite is no longer available to new users.")
  );
  assert.equal(failure.status, 500);
  assert.match(failure.message, /GEMINI_MODEL/);
});

test("overloaded is the case actually worth retrying", () => {
  assert.equal(describeModelFailure(apiError(503, "The model is overloaded.")).status, 503);
  assert.equal(describeModelFailure(apiError(0, "UNAVAILABLE")).status, 503);
});

test("an otherwise-unrecognised 400 is named as a rejected request, not a network error", () => {
  const failure = describeModelFailure(apiError(400, "Request payload size exceeds the limit."));
  assert.equal(failure.status, 500);
  assert.match(failure.message, /거부되었습니다/);
});

test("anything unrecognised keeps the original generic message", () => {
  const failure = describeModelFailure(new Error("socket hang up"));
  assert.equal(failure.status, 502);
  assert.match(failure.message, /연결할 수 없습니다/);
});
