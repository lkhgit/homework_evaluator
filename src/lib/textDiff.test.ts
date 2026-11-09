import assert from "node:assert/strict";
import { test } from "node:test";

import { diffWords } from "./textDiff";

const changedText = (segments: { text: string; changed: boolean }[]) =>
  segments.filter((s) => s.changed).map((s) => s.text);

test("identical text has nothing highlighted", () => {
  const diff = diffWords("Read the article.", "Read the article.")!;
  assert.deepEqual(changedText(diff.original), []);
  assert.deepEqual(changedText(diff.revised), []);
});

test("a replaced phrase is highlighted on both sides and nothing else", () => {
  const diff = diffWords(
    "Drag the molecule markers into the chamber.",
    "Select the molecule markers from a list."
  )!;
  assert.deepEqual(changedText(diff.revised), ["Select", "from a list."]);
  assert.deepEqual(changedText(diff.original), ["Drag", "into the chamber."]);
});

test("segments always rebuild the original strings exactly", () => {
  const a = "Answer within twelve minutes.\nThe timer starts when you open the quiz.";
  const b = "Answer within twenty minutes.\nThe timer starts when you open the quiz and can be paused.";
  const diff = diffWords(a, b)!;
  assert.equal(diff.original.map((s) => s.text).join(""), a);
  assert.equal(diff.revised.map((s) => s.text).join(""), b);
  assert.deepEqual(changedText(diff.revised), ["twenty", "quiz and can be paused."]);
});

test("Korean text is compared by word", () => {
  const diff = diffWords("시뮬레이션 결과를 기억하세요.", "시뮬레이션 결과를 화면에 남겨 두세요.")!;
  assert.ok(changedText(diff.revised).join(" ").includes("화면에"));
});

test("texts too large to compare return null instead of freezing the page", () => {
  const big = Array.from({ length: 4000 }, (_, i) => `a${i}`).join(" ");
  const other = Array.from({ length: 4000 }, (_, i) => `b${i}`).join(" ");
  assert.equal(diffWords(big, other), null);
});
