import test from "node:test";
import assert from "node:assert/strict";
import { teacherNotices } from "./teacherNotices";

test("automatic recalculation alone does not show a warning", () => {
  assert.deepEqual(teacherNotices(['단계 "step-5"의 환경 전환 여부가 다시 계산되었습니다.'], []), []);
});

test("repeated internal issues become one actionable notice without internal ids", () => {
  const messages = teacherNotices([
    '단계 "step-1"의 개선안이 기존보다 길지 않은 제한 시간을 제안하여, 시간 개선으로 반영되지 않았습니다.',
    '단계 "step-2"의 개선안에서 유효하지 않은 타이머 변경이 제거되었습니다.',
    '근거 인용문 8개가 과제 원문에서 확인되지 않아 제거되었습니다.',
  ], []);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(message => !message.includes("step-")));
});

test("material document warnings and conflicts remain, with duplicates removed", () => {
  assert.deepEqual(teacherNotices(["반응 시간이 일치하지 않습니다.", "보고서 양식의 위치를 확인하세요."], [{description:"반응 시간이 일치하지 않습니다."}]), ["반응 시간이 일치하지 않습니다.", "보고서 양식의 위치를 확인하세요."]);
});
