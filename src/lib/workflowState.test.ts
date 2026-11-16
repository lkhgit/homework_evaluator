import assert from "node:assert/strict";
import { test } from "node:test";

import { completionSummary, scoreChangeLabel } from "@/components/WorkflowScreens";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import { sampleAnalysisFor } from "./analysisSource";
import { runEngine } from "./engine";
import { buildSummary } from "./exportSummary";
import { handoutPlainText } from "./studentHandout";
import type { Repair, Step } from "./schema";
import {
  analysisKey,
  assignmentKey,
  canAcceptRepair,
  lockDecision,
  deliverableFor,
  revisionFor,
  objectiveChanged,
  pdfResultAction,
  stepForFriction,
  resolveCustomRepair,
  titleOf,
  withRepair,
} from "./workflowState";

const steps: Step[] = BIOLOGY_SAMPLE.analysis.steps;
const validRepair: Repair = steps.find((step) => step.repair !== null)!.repair!;

test("the bundled sample analysis is used only for the objective it was judged against", () => {
  assert.equal(sampleAnalysisFor(BIOLOGY_TEXT, BIOLOGY_SAMPLE.analysisObjective), BIOLOGY_SAMPLE);
  // Whitespace differences are not a different goal.
  assert.equal(
    sampleAnalysisFor(`  ${BIOLOGY_TEXT}\n`, `${BIOLOGY_SAMPLE.analysisObjective}  `),
    BIOLOGY_SAMPLE,
  );
  // An edited objective, or the sample's second candidate, needs a real analysis.
  assert.equal(sampleAnalysisFor(BIOLOGY_TEXT, "Design a controlled experiment."), null);
  assert.equal(sampleAnalysisFor(BIOLOGY_TEXT, BIOLOGY_SAMPLE.objectives[1].text), null);
  assert.equal(sampleAnalysisFor("Some other assignment", BIOLOGY_SAMPLE.analysisObjective), null);
});

test("editing the objective is detected, ignoring only whitespace", () => {
  assert.equal(objectiveChanged(" a  b ", "a b"), false);
  assert.equal(objectiveChanged("a b c", "a b"), true);
});

test("a custom-repair reply that arrives after a new analysis is dropped", () => {
  const outcome = resolveCustomRepair({
    requestToken: 3,
    currentToken: 4,
    steps,
    stepId: "s4",
    response: validRepair,
  });
  assert.deepEqual(outcome, { status: "stale" });
});

test("a malformed or empty custom-repair reply is rejected, not recorded", () => {
  for (const response of [null, undefined, {}, { suggestion: "x" }]) {
    const outcome = resolveCustomRepair({ requestToken: 1, currentToken: 1, steps, stepId: "s4", response });
    assert.equal(outcome.status, "invalid");
  }
});

test("a custom-repair reply for a step that no longer exists is rejected", () => {
  const outcome = resolveCustomRepair({
    requestToken: 1,
    currentToken: 1,
    steps,
    stepId: "s99",
    response: validRepair,
  });
  assert.equal(outcome.status, "missing-step");
});

test("a current, valid custom repair replaces only its own step", () => {
  const outcome = resolveCustomRepair({ requestToken: 1, currentToken: 1, steps, stepId: "s1", response: validRepair });
  assert.equal(outcome.status, "accepted");
  if (outcome.status !== "accepted") return;
  const next = withRepair(steps, "s1", outcome.repair);
  assert.deepEqual(next.find((step) => step.id === "s1")!.repair, validRepair);
  assert.deepEqual(next.filter((step) => step.id !== "s1"), steps.filter((step) => step.id !== "s1"));
});

test("only a step that carries a proposal can be accepted", () => {
  assert.equal(canAcceptRepair(steps, "s4"), true);
  assert.equal(canAcceptRepair(steps, "s1"), false); // no proposal: would be a phantom repair
  assert.equal(canAcceptRepair(steps, "missing"), false);
});

test("an unchanged original is exported as the original, with no rewrite claimed", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const report = runEngine(analysis);
  const file = buildSummary(
    { kind: "original", title: titleOf(BIOLOGY_TEXT), text: BIOLOGY_TEXT },
    BIOLOGY_SAMPLE.analysisObjective,
    {
      analysis,
      report,
      scoreBefore: 50,
      repairedAnalysis: analysis,
      repairedReport: report,
      scoreAfter: 50,
      frictionResolutions: [],
    },
  );
  assert.match(file, /^# Diffusion Lab: Concentration Gradients/);
  assert.match(file, /## 원본 과제 \(변경 없음\)/);
  assert.match(file, /다시 작성한 내용은 없습니다/);
  assert.doesNotMatch(file, /수정된 과제 \(/);
  assert.ok(file.includes(BIOLOGY_TEXT.trim()));
  assert.ok(file.includes(BIOLOGY_SAMPLE.analysisObjective));
});

test("an AI rewrite is labelled as one, with the projection caveat", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const report = runEngine(analysis);
  const file = buildSummary(
    { kind: "revised", revision: { title: "T", revisedText: "Body", changes: [], stepExcerpts: [] } },
    "Goal",
    { analysis, report, scoreBefore: 1, repairedAnalysis: analysis, repairedReport: report, scoreAfter: 2, frictionResolutions: [] },
  );
  assert.match(file, /AI 수정본/);
  assert.match(file, /이 문장을 다시 분석한 결과가 아닙니다/);
  assert.match(file, /번역하지 않았습니다/);
});

test("a title is taken from the first non-empty line", () => {
  assert.equal(titleOf("\r\n  \r\n  Lab 3 \r\nbody"), "Lab 3");
  assert.equal(titleOf("   "), "과제");
});

test("completion copy is honest about what was measured", () => {
  const base = { frictionCount: 5, frictionResolved: 0, frictionUnverified: 0, repairsApplied: 0, exportKind: "original" as const };
  assert.match(completionSummary(base), /원본 과제를 그대로 두었습니다/);
  assert.match(completionSummary({ ...base, frictionCount: 0 }), /문제 지점이 없습니다/);

  const allResolved = completionSummary({ ...base, frictionResolved: 5, repairsApplied: 3, exportKind: "revised" });
  assert.match(allResolved, /개선안에 적힌 효과/);
  assert.match(allResolved, /다시 측정한 결과는 아닙니다/);
  assert.doesNotMatch(allResolved, /수정된 과제에서 해결/);

  // Zero findings with an accepted repair is not "every finding resolved".
  const vacuous = completionSummary({ ...base, frictionCount: 0, repairsApplied: 1, exportKind: "revised" });
  assert.doesNotMatch(vacuous, /모두 해소/);

  const partial = completionSummary({ ...base, frictionResolved: 2, frictionUnverified: 1, repairsApplied: 2, exportKind: null });
  assert.match(partial, /내보낼 수 없습니다/);
  assert.match(partial, /5개 중 2개가 해소되고 2개가 남습니다/);
  assert.match(partial, /확인할 수 없는 항목은 1개/);
});

test("the score change is named whichever way it moved", () => {
  assert.equal(scoreChangeLabel(45, 52), "7점 개선 · 측정된 문제 감소");
  assert.equal(scoreChangeLabel(45, 45), "변화 없음");
  assert.equal(scoreChangeLabel(50, 47), "3점 악화 · 측정된 문제 증가");
});

test("a PDF result never overwrites edits made while it was being read", () => {
  const base = { requestToken: 2, currentToken: 2, mounted: true, editsAtStart: 5, editsNow: 5 };
  assert.equal(pdfResultAction(base), "apply");
  assert.equal(pdfResultAction({ ...base, editsNow: 6 }), "offer");
  assert.equal(pdfResultAction({ ...base, currentToken: 3 }), "ignore");
  assert.equal(pdfResultAction({ ...base, mounted: false }), "ignore");
});

test("Barrier Trace offers only a repair that acts on the finding's barrier", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const trace = (id: string) =>
    stepForFriction(analysis, analysis.frictionMoments.find((item) => item.id === id)!);

  // f5 is context switching; s10's response-alternative repair cannot move it.
  const switching = trace("f5")!;
  assert.equal(switching.repairRelevant, false);

  assert.deepEqual([trace("f4")!.step.id, trace("f4")!.repairRelevant], ["s10", true]);
  assert.deepEqual([trace("f1")!.step.id, trace("f1")!.repairRelevant], ["s5", true]);
  assert.deepEqual([trace("f2")!.step.id, trace("f2")!.repairRelevant], ["s4", true]);
  assert.deepEqual([trace("f3")!.step.id, trace("f3")!.repairRelevant], ["s9", true]);
});

test("the deliverable is the original when nothing is accepted, and waits for a rewrite otherwise", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const base = {
    originalText: BIOLOGY_TEXT,
    objective: BIOLOGY_SAMPLE.analysisObjective,
    timeConstraints: analysis.timeConstraints,
  };

  const original = deliverableFor({ ...base, acceptedSteps: [], revision: null })!;
  assert.equal(original.kind, "original");
  assert.equal(original.check, null, "nothing was rewritten, so nothing is compared");
  assert.equal(original.handout.title, "Diffusion Lab: Concentration Gradients");

  // A step without a proposal is not an accepted repair.
  const phantom = deliverableFor({ ...base, acceptedSteps: [analysis.steps[0]], revision: null })!;
  assert.equal(phantom.kind, "original");

  const s9 = analysis.steps.find((step) => step.id === "s9")!;
  assert.equal(deliverableFor({ ...base, acceptedSteps: [s9], revision: null }), null);

  const revision = { title: "Diffusion Lab", revisedText: BIOLOGY_TEXT.replace(" within twelve minutes", ""), changes: [{ what: "타이머 제거", why: "교사용 메모" }], stepExcerpts: [] };
  const revised = deliverableFor({ ...base, acceptedSteps: [s9], revision })!;
  assert.equal(revised.kind, "revised");
  assert.equal(revised.body, revision.revisedText);
  assert.equal(revised.check?.repairs[0].stepId, "s9");
  // The model's change notes are for the teacher, not the student.
  assert.doesNotMatch(handoutPlainText(revised.handout), /교사용 메모|타이머 제거/);
});

test("the teacher report carries the local revision check; the student handout does not", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const report = runEngine(analysis);
  const s9 = analysis.steps.find((step) => step.id === "s9")!;
  const revision = { title: "Diffusion Lab", revisedText: BIOLOGY_TEXT, changes: [], stepExcerpts: [] };
  const deliverable = deliverableFor({
    originalText: BIOLOGY_TEXT,
    objective: BIOLOGY_SAMPLE.analysisObjective,
    acceptedSteps: [s9],
    revision,
    timeConstraints: analysis.timeConstraints,
  })!;
  const file = buildSummary(
    { kind: "revised", revision },
    BIOLOGY_SAMPLE.analysisObjective,
    { analysis, report, scoreBefore: 52, repairedAnalysis: analysis, repairedReport: report, scoreAfter: 52, frictionResolutions: [], revisionCheck: deliverable.check },
  );
  assert.match(file, /## 수정본 문장 점검 \(로컬 비교, 모델 호출 없음\)/);
  assert.match(file, /시간 제한 문장이 수정본에 그대로 남아 있습니다/);
  assert.doesNotMatch(handoutPlainText(deliverable.handout), /점검|측정|\/100/);
});

test("a rewrite for different accepted repairs is stale and yields no handout", () => {
  const analysis = BIOLOGY_SAMPLE.analysis;
  const stored = { key: "repairs:s9", value: { title: "Old", revisedText: "Old rewrite", changes: [], stepExcerpts: [] } };
  assert.equal(revisionFor(stored, "repairs:s9")?.title, "Old");
  const stale = revisionFor(stored, "repairs:s5,s9");
  assert.equal(stale, null);
  const s5 = analysis.steps.find((step) => step.id === "s5")!;
  assert.equal(
    deliverableFor({
      originalText: BIOLOGY_TEXT,
      objective: BIOLOGY_SAMPLE.analysisObjective,
      acceptedSteps: [s5],
      revision: stale,
      timeConstraints: analysis.timeConstraints,
    }),
    null,
  );
});

test("memo keys ignore Unicode form and whitespace, and nothing else", () => {
  const nfc = "확산 실험\n\n시뮬레이션을 엽니다.";
  assert.equal(assignmentKey(nfc), assignmentKey(`  ${nfc.normalize("NFD").replace("\n\n", "\n \n")}  `));
  assert.notEqual(assignmentKey("Open the sim."), assignmentKey("Open the simulation."));
  assert.notEqual(assignmentKey("Case"), assignmentKey("case"), "case can change meaning, so it stays part of the key");
  assert.equal(assignmentKey("Open  the\tsim.\r\nThen record."), assignmentKey("Open the sim.\nThen record.  "));
  // Line breaks shape the handout (paragraphs, lists), so re-wrapping is a change.
  assert.notEqual(assignmentKey("1. Open the sim\n2. Record"), assignmentKey("1. Open the sim 2. Record"));
  assert.notEqual(assignmentKey("Intro.\n\nBody."), assignmentKey("Intro.\nBody."));

  const text = "Read the article.";
  assert.equal(analysisKey(text, " Explain  diffusion "), analysisKey(text, "Explain diffusion"));
  assert.notEqual(analysisKey(text, "Explain diffusion"), analysisKey(text, "Explain osmosis"));
  // The separator keeps text and objective from bleeding into each other.
  assert.notEqual(analysisKey("a b", "c"), analysisKey("a", "b c"));
});

test("re-locking unchanged inputs keeps results; 다시 분석 always asks the model", () => {
  const key = analysisKey("text", "goal");
  const base = { key, currentKey: key, objectiveChangedSinceAnalysis: false, remembered: true, force: false };
  assert.equal(lockDecision(base), "show-current");
  assert.equal(lockDecision({ ...base, force: true }), "request");
  // Edited away and back: the old results were already retired, so the
  // remembered answer is shown as a fresh graph.
  assert.equal(lockDecision({ ...base, currentKey: analysisKey("text", "other") }), "use-remembered");
  assert.equal(lockDecision({ ...base, currentKey: "", remembered: false }), "request");
  assert.equal(lockDecision({ ...base, objectiveChangedSinceAnalysis: true, remembered: false }), "request");
});
