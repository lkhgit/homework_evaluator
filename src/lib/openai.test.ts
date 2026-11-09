import assert from "node:assert/strict";
import { test } from "node:test";

import { describeModelFailure } from "./openai";

/** Shaped like the OpenAI SDK's APIError: status, code and a message. */
function apiError(status: number, message: string, code?: string) {
  return { status, message, code };
}

test("an exhausted quota says so instead of blaming the network", () => {
  const failure = describeModelFailure(
    apiError(429, "You exceeded your current quota", "insufficient_quota")
  );
  assert.equal(failure.status, 429);
  assert.match(failure.message, /크레딧/);
});

test("a plain rate limit asks the educator to wait", () => {
  const failure = describeModelFailure(apiError(429, "Rate limit reached", "rate_limit_exceeded"));
  assert.equal(failure.status, 429);
  assert.match(failure.message, /잠시 후/);
});

test("a missing or invalid key is reported as configuration, not as a retry", () => {
  const failure = describeModelFailure(apiError(401, "Incorrect API key provided.", "invalid_api_key"));
  assert.equal(failure.status, 500);
  assert.match(failure.message, /API 키/);
});

test("a bare 401/403 is also treated as a configuration problem", () => {
  assert.equal(describeModelFailure(apiError(401, "unauthenticated")).status, 500);
  assert.equal(describeModelFailure(apiError(403, "permission denied")).status, 500);
});

test("a retired or misspelled model is named as a configuration problem, not a network error", () => {
  const failure = describeModelFailure(
    apiError(404, "The model `gpt-x` does not exist.", "model_not_found")
  );
  assert.equal(failure.status, 500);
  assert.match(failure.message, /OPENAI_MODEL/);
});

test("overloaded is the case actually worth retrying", () => {
  assert.equal(describeModelFailure(apiError(503, "The model is overloaded.")).status, 503);
  assert.equal(describeModelFailure(apiError(0, "Service UNAVAILABLE")).status, 503);
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
