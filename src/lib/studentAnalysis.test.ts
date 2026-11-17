import test from "node:test";
import assert from "node:assert/strict";
import { studentSchema } from "./studentAnalysis";

test("학생 안내는 단계의 필수 항목과 평가 기준을 구분해 검증한다", () => {
  const guide = { title: "실험", conflicts: [], warnings: [], statedCriteria: [], suggestedCriteria: ["단위를 확인"], steps: [{ action: "측정", materials: "비커", completion: "지침에 명시되지 않음", caution: "온도 기록", difficulties: "없음", sources: [], terms: [] }] };
  assert.equal(studentSchema.safeParse({ ...guide, requirements: [] }).success, true);
  assert.equal(studentSchema.safeParse({ ...guide, steps: [{ action: "측정" }] }).success, false);
  assert.equal(studentSchema.safeParse({ ...guide, steps: [] }).success, false);
});
