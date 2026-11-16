import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import {
  findEvidenceSpan,
  isMeaningfulEvidence,
  locateEvidence,
  verifyEvidence,
} from "./evidenceGuard";
import type { Analysis } from "./schema";

function withEvidence(evidence: string, constraintEvidence = ""): Analysis {
  const step = { ...BIOLOGY_SAMPLE.analysis.steps[0], evidence };
  return {
    steps: [step],
    frictionMoments: [],
    timeConstraints: constraintEvidence
      ? [{ id: "t", limitMinutes: 20, stepIds: [step.id], evidence: constraintEvidence }]
      : [],
  };
}

test("a verified quote with straight quotes highlights the curly-quoted original", () => {
  const source = "Intro.\nRead the “Results” section before answering.\nThen stop.";
  const evidence = 'Read the "Results" section before answering.';
  assert.equal(verifyEvidence(withEvidence(evidence), source).verified, 1);
  const span = locateEvidence(source, evidence);
  assert.ok(span);
  assert.equal(source.slice(span.start, span.end), "Read the “Results” section before answering.");
});

test("a quote that differs only in line wrapping maps back to the wrapped original", () => {
  const source = "Record all three\n   readings in your notebook.";
  const span = findEvidenceSpan(source, "record all three readings in your notebook.");
  assert.ok(span);
  assert.equal(source.slice(span.start, span.end), source);
});

test("NFC evidence matches NFD Hangul source and highlights whole syllables", () => {
  const nfc = "시뮬레이션 결과를 공책에 기록하세요.";
  const source = `과제 안내\n${nfc.normalize("NFD")}\n끝`;
  assert.equal(verifyEvidence(withEvidence(nfc), source).verified, 1);
  const span = locateEvidence(source, nfc);
  assert.ok(span);
  assert.equal(source.slice(span.start, span.end).normalize("NFC"), nfc);
});

test("trivially short quotes are discarded and counted as too short", () => {
  for (const evidence of ["the", ".", "제출", "  "]) {
    const check = verifyEvidence(withEvidence(evidence), "the student. 제출 the end");
    assert.equal(check.verified, 0, evidence);
    assert.equal(check.analysis.steps[0].evidence, "");
  }
  const check = verifyEvidence(withEvidence("the"), "the end");
  assert.equal(check.discardedTooShort, 1);
});

test("short but real timer clauses are kept", () => {
  assert.equal(isMeaningfulEvidence("20분"), true);
  assert.equal(isMeaningfulEvidence("10 min"), true);
  assert.equal(isMeaningfulEvidence("12-minute timer"), true);
  assert.equal(isMeaningfulEvidence("타이머"), true);
  const source = "퀴즈는 20분 안에 끝내야 합니다.";
  const check = verifyEvidence(withEvidence("퀴즈는 20분 안에 끝내야 합니다.", "20분"), source);
  assert.equal(check.verified, 2);
  assert.equal(check.analysis.timeConstraints[0].evidence, "20분");
});

test("a quote absent from the source is still discarded", () => {
  const check = verifyEvidence(withEvidence("This sentence is not in the assignment."), BIOLOGY_TEXT);
  assert.equal(check.verified, 0);
  assert.equal(check.discardedTooShort, 0);
});

test("every quote in the bundled sample survives the guard", () => {
  const check = verifyEvidence(BIOLOGY_SAMPLE.analysis, BIOLOGY_TEXT);
  assert.equal(check.discarded, 0, `discarded: ${[...check.discardedStepIds, ...check.discardedConstraintIds].join(", ")}`);
});

test("the largest accepted analysis is verified in well under a second", () => {
  // 30,000 characters, 80 steps, 30 timers: the REQUEST_LIMITS upper bound.
  const sentence = "Record the “reading” from the simulation in your notebook. ";
  const source = sentence.repeat(Math.ceil(30_000 / sentence.length)).slice(0, 30_000);
  const base = BIOLOGY_SAMPLE.analysis.steps[0];
  const analysis: Analysis = {
    steps: Array.from({ length: 80 }, (_, i) => ({
      ...base,
      id: `s${i}`,
      evidence: i % 2 ? 'record the "reading" from the simulation' : "a quote that is not in the source",
    })),
    frictionMoments: [],
    timeConstraints: Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      limitMinutes: 20,
      stepIds: ["s0"],
      evidence: "in your notebook.",
    })),
  };
  const started = performance.now();
  const checked = verifyEvidence(analysis, source);
  const elapsed = performance.now() - started;
  assert.equal(checked.verified, 40 + 30);
  assert.equal(checked.discarded, 40);
  assert.ok(elapsed < 500, `took ${Math.round(elapsed)} ms`);
});
