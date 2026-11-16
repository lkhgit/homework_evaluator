import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import { checkRevision, measureText, objectiveKeywords, revisionCheckMarkdown } from "./revisionCheck";

const analysis = BIOLOGY_SAMPLE.analysis;
const step = (id: string) => analysis.steps.find((item) => item.id === id)!;

function check(revisedText: string, stepIds: string[] = [], objective = BIOLOGY_SAMPLE.analysisObjective) {
  return checkRevision({
    originalText: BIOLOGY_TEXT,
    revisedText,
    objective,
    acceptedSteps: stepIds.map(step),
    timeConstraints: analysis.timeConstraints,
  });
}

test("length and reading time are exact counts of the two texts", () => {
  const original = measureText("one two three four");
  assert.equal(original.words, 4);
  assert.equal(original.characters, 18);
  const result = check(`${BIOLOGY_TEXT}\n\nExtra sentence added here.`);
  assert.equal(result.revised.words - result.original.words, 4);
  assert.equal(result.identical, false);
  assert.equal(check(BIOLOGY_TEXT.replace(/\n/g, "\n\n")).identical, true);
});

test("objective words are checked only if the original used them", () => {
  // "membrane" is in the objective but not in the sample text, so its absence
  // from a rewrite says nothing and it is not reported.
  const words = check(BIOLOGY_TEXT).keywords.map((item) => item.keyword);
  assert.ok(!words.includes("membrane"));
  assert.ok(words.includes("concentration"));
  assert.ok(check(BIOLOGY_TEXT).keywords.every((item) => item.status === "kept"));
});

test("a rewrite that drops an objective term is flagged", () => {
  const diluted = BIOLOGY_TEXT.replace(/concentration/gi, "amount");
  const concentration = check(diluted).keywords.find((item) => item.keyword === "concentration");
  assert.equal(concentration?.status, "missing");
});

test("Korean objective stems match other inflections", () => {
  assert.deepEqual(objectiveKeywords("농도 기울기가 분자의 이동에 미치는 영향을 설명하시오."), [
    "농도", "기울기", "분자", "이동", "영향",
  ]);
  const result = checkRevision({
    originalText: "농도가 다른 두 용액에서 분자를 관찰합니다.",
    revisedText: "농도를 바꾸며 분자의 움직임을 관찰합니다.",
    objective: "농도 차이가 분자 이동에 주는 영향",
    acceptedSteps: [],
    timeConstraints: [],
  });
  assert.deepEqual(
    result.keywords.map((item) => [item.keyword, item.status]),
    [["농도", "kept"], ["분자", "kept"]],
  );
});

test("numbers that disappear from the original are listed for the teacher", () => {
  const result = check(BIOLOGY_TEXT.replace("Module 4", "the module"));
  assert.deepEqual(result.missingNumbers, ["4"]);
});

test("removing a timer is not claimed when its sentence is still in the text", () => {
  const unchanged = check(BIOLOGY_TEXT, ["s9"]).repairs[0];
  assert.equal(unchanged.status, "not_detected");
  const edited = check(BIOLOGY_TEXT.replace("within twelve minutes. The timer starts when you open the quiz and does not pause.", "at your own pace."), ["s9"]).repairs[0];
  // A changed sentence is not proof the limit is gone, so it is left to the teacher.
  assert.equal(edited.status, "teacher_check");
});

test("a repair that cannot be detected from text is never reported as verified", () => {
  const result = check(`${BIOLOGY_TEXT}\nYour readings are shown beside each question.`, ["s5", "s8", "s10"]);
  assert.ok(result.repairs.every((item) => item.status === "teacher_check"));
});

test("an extended limit is detected only by its number appearing", () => {
  const extended = structuredClone(step("s9"));
  extended.repair!.effects = {
    ...extended.repair!.effects,
    timeConstraintAction: "set_limit",
    timeConstraintLimitMinutes: 30,
  };
  const run = (text: string) =>
    checkRevision({
      originalText: BIOLOGY_TEXT,
      revisedText: text,
      objective: "",
      acceptedSteps: [extended],
      timeConstraints: analysis.timeConstraints,
    }).repairs[0].status;
  assert.equal(run(BIOLOGY_TEXT.replace("twelve minutes", "30 minutes")), "detected");
  assert.equal(run(BIOLOGY_TEXT), "not_detected");
});

test("the report section labels itself as text comparison, not re-measurement", () => {
  const lines = revisionCheckMarkdown(check(BIOLOGY_TEXT, ["s9"])).join("\n");
  assert.match(lines, /로컬 비교, 모델 호출 없음/);
  assert.match(lines, /다시 측정한 것이 아니며/);
  assert.match(lines, /남아 있다고 목표 보존이 확인되지는 않음/);
});

test("decomposed (NFD) Hangul counts the same characters as composed text", () => {
  const composed = "\uB18D\uB3C4 \uAE30\uC6B8\uAE30";
  assert.deepEqual(measureText(composed.normalize("NFD")), measureText(composed));
});

test("connective and verb stems are not treated as goal vocabulary", () => {
  // "농도 기울기가 막을 통한 분자의 이동에 미치는 영향을 설명하시오."
  const keywords = objectiveKeywords(
    "\uB18D\uB3C4 \uAE30\uC6B8\uAE30\uAC00 \uB9C9\uC744 \uD1B5\uD55C \uBD84\uC790\uC758 \uC774\uB3D9\uC5D0 \uBBF8\uCE58\uB294 \uC601\uD5A5\uC744 \uC124\uBA85\uD558\uC2DC\uC624."
  );
  assert.ok(!keywords.includes("\uD1B5\uD55C"), keywords.join(","));
  assert.ok(!keywords.includes("\uBBF8\uCE58"), keywords.join(","));
  assert.ok(keywords.includes("\uB18D\uB3C4"));
});
