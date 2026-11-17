export function teacherNotices(warnings: readonly string[], conflicts: readonly { description: string }[]): string[] {
  const messages = conflicts.map(conflict => conflict.description.trim());
  for (const warning of warnings) {
    if (/^단계 ".*"의 환경 전환 여부가 다시 계산되었습니다\.$/.test(warning)) continue;
    if (warning.startsWith("근거 인용문 ")) {
      messages.push("분석 근거 일부를 원문에서 확인하지 못했습니다. 해당 설명을 원본과 비교해 주세요.");
    } else if (/^단계 ".*"의 개선안/.test(warning)) {
      messages.push("시간 제한 개선안 일부를 적용하지 못했습니다. 원래 제한 시간과 제안된 시간을 확인해 주세요.");
    } else if (/^(단계|타이머|어려움) (id |")/.test(warning)) {
      messages.push("일부 단계의 연결 정보를 확인하지 못했습니다. 수행 순서와 제한 시간 적용 범위를 원본과 비교해 주세요.");
    } else {
      messages.push(warning.trim());
    }
  }
  return [...new Set(messages.filter(Boolean))];
}
