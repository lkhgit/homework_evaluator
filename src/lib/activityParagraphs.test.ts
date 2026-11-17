import test from "node:test";
import assert from "node:assert/strict";
import { activityParagraphs } from "./activityParagraphs";

test("reflows wrapped lines and extra spaces while preserving paragraphs", () => {
  assert.deepEqual(activityParagraphs("  실험  결과를\r\n 기록하세요.\n\n 다음 활동을 확인하세요.  "), ["실험 결과를 기록하세요.", "다음 활동을 확인하세요."]);
});

test("retains numbered and bulleted items and scientific values", () => {
  assert.deepEqual(activityParagraphs("1. NaCl 0.5 M을\n 10 mL 넣는다.\n2. 30초 기다린다.\n• pH 7.4 확인"), ["1. NaCl 0.5 M을 10 mL 넣는다.", "2. 30초 기다린다.", "• pH 7.4 확인"]);
  assert.deepEqual(activityParagraphs(" \n\t "), []);
});
