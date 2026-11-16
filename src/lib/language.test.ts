import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_TEXT } from "@/samples/biology";
import { documentLanguageFor, speechLanguageFor } from "./language";

test("Korean text is read with a Korean voice", () => {
  assert.equal(speechLanguageFor("시뮬레이션을 열고 결과를 기록하세요."), "ko-KR");
});

test("the English sample is marked and read as English", () => {
  assert.equal(documentLanguageFor(BIOLOGY_TEXT), "en");
  assert.equal(speechLanguageFor(BIOLOGY_TEXT), "en-US");
});

test("Korean text with a few English tool names stays Korean", () => {
  assert.equal(documentLanguageFor("Canvas에서 PhET 시뮬레이션을 열고 결과를 공책에 기록합니다."), "ko");
});

test("empty text falls back to the interface language", () => {
  assert.equal(speechLanguageFor(""), "ko-KR");
});
