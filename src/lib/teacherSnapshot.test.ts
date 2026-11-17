import test from "node:test";
import assert from "node:assert/strict";
import { versionKey, type TeacherSnapshot } from "./teacherSnapshot";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
test("이력은 탐색만으로 추가되지 않고 분석과 개선안 변경을 구분한다", () => {
  const value: TeacherSnapshot = { projectId: "one", stage: "journey", assignmentDraft: BIOLOGY_TEXT, analyzedText: BIOLOGY_TEXT, objective: "개념 설명", baseAnalysis: BIOLOGY_SAMPLE.analysis, steps: BIOLOGY_SAMPLE.analysis.steps, appliedRepairIds: [], revised: null, visited: ["analyze", "journey"], selectedFriction: null, condition: "working_memory", analysisWarnings: [], sourceConflicts: [] };
  assert.equal(versionKey(value), versionKey({ ...value, stage: "barrier" }));
  assert.notEqual(versionKey(value), versionKey({ ...value, appliedRepairIds: ["s1"] }));
  assert.notEqual(versionKey(value), versionKey({ ...value, objective: "새 목표" }));
  assert.deepEqual(structuredClone(value), value);
});
