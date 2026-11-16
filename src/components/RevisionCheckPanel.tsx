import { REPAIR_STATUS_LABEL, type RevisionCheck } from "@/lib/revisionCheck";

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

/**
 * What code can say about the rewritten text by comparing it with the
 * original. Every row names the kind of check, so nothing here reads as a
 * re-measurement of the task.
 */
export default function RevisionCheckPanel({ check }: { check: RevisionCheck }) {
  const wordDelta = check.revised.words - check.original.words;
  const missingKeywords = check.keywords.filter((item) => item.status === "missing");
  const keptKeywords = check.keywords.filter((item) => item.status === "kept");
  return (
    <section className="revision-check" aria-labelledby="revision-check-title">
      <h2 id="revision-check-title">수정본 문장 점검</h2>
      <p className="revision-check__note">
        원본과 AI 수정본 문장을 이 기기에서 코드로 비교한 결과입니다(모델 호출 없음). 단계 분석을
        다시 측정하지 않았고 의미나 학습 목표가 지켜졌는지도 판단하지 않습니다.
      </p>
      <dl>
        {check.identical && (
          <div><dt>내용</dt><dd>수정본이 원본과 같습니다 (공백·대소문자 차이 제외).</dd></div>
        )}
        <div>
          <dt>길이 <small>정확한 수치</small></dt>
          <dd>
            {check.original.words.toLocaleString("ko-KR")} → {check.revised.words.toLocaleString("ko-KR")}단어 ({signed(wordDelta)}),{" "}
            {check.original.characters.toLocaleString("ko-KR")} → {check.revised.characters.toLocaleString("ko-KR")}자
          </dd>
        </div>
        <div>
          <dt>본문 읽기 시간 <small>추정: 영어 기반 속도, 링크된 자료 제외</small></dt>
          <dd>
            약 {check.original.readingMinutesMean} → {check.revised.readingMinutesMean}분 · 느린 독자 기준{" "}
            {check.original.readingMinutesConservative} → {check.revised.readingMinutesConservative}분
          </dd>
        </div>
        <div>
          <dt>학습 목표 어휘 <small>단어 일치 점검, 의미 보존 판단 아님</small></dt>
          <dd>
            {check.keywords.length === 0
              ? "원본에서 학습 목표의 단어를 찾지 못해 점검하지 않았습니다."
              : missingKeywords.length === 0
                ? `원본에 있던 목표 어휘 ${keptKeywords.length}개가 모두 수정본에 있습니다 (${keptKeywords.map((item) => item.keyword).join(", ")}). 단어가 남아 있다고 학습 목표가 보존된 것은 아닙니다.`
                : `수정본에 없는 목표 어휘: ${missingKeywords.map((item) => item.keyword).join(", ")}. 개념이 빠졌는지 확인하세요.`}
          </dd>
        </div>
        {check.missingNumbers.length > 0 && (
          <div>
            <dt>사라진 숫자 <small>정확한 비교</small></dt>
            <dd>원본에 있던 {check.missingNumbers.join(", ")}이(가) 수정본에 없습니다. 의도한 변경인지 확인하세요.</dd>
          </div>
        )}
      </dl>
      {check.repairs.length > 0 && (
        <>
          <h3>채택한 개선안별 점검</h3>
          <ul className="revision-check__repairs">
            {check.repairs.map((repair) => (
              <li key={repair.stepId} className={`is-${repair.status}`}>
                <strong>{REPAIR_STATUS_LABEL[repair.status]}</strong>
                <span>{repair.action}</span>
                <small>{repair.detail}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
