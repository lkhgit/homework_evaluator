import { ChevronDown } from "lucide-react";

import { CONSERVATIVE_READING_WPM, MEAN_READING_WPM } from "@/lib/engine";

export interface AccessibilityScoreData {
  score: number;
  breakdown: { label: string; points: number }[];
}

export default function AccessibilityScore({
  score,
  breakdown,
}: AccessibilityScoreData) {
  return (
    <section className="confidence-score" aria-labelledby="confidence-title">
      <div>
        <p className="stat-label">접근성 점수</p>
        <div className="score-value">
          <span>{score}</span>
          <span><span className="sr-only">점, 만점 </span>/ 100</span>
        </div>
      </div>
      <div className="score-disclosure">
        <p id="confidence-title">
          100점은 찾은 문제가 없다는 뜻이고 문제가 많을수록 점수가 내려갑니다. 법적 준수 여부나
          통계적 신뢰도가 아니라 과제 안의 접근성 문제를 나타냅니다.
        </p>
        <details>
          <summary>
            계산 방식 보기 <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <ul>
            <li>
              <span>기본 점수</span>
              <strong>100</strong>
            </li>
            {breakdown.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.points < 0 ? `−${Math.abs(item.points)}` : `+${item.points}`}</strong>
              </li>
            ))}
          </ul>
          <p className="score-assumptions">
            계산식은 규칙 기반입니다. 다만 입력값인 단계별 부담 수준, 목표 관련성, 문제 지점
            심각도, 단계와 시간 제약 구성에는 AI 모델 판단이 들어가므로 교사 확인이 필요합니다.
            감점 가중치는 제품 설계 단계에서 정한 기준이며 연구로 검증한 값은 아닙니다. 읽기 시간은
            Brysbaert(2019)의 성인 영어 비문학 묵독 평균(분당 {MEAN_READING_WPM}단어)과 느린
            독자를 가정한 보수적 속도(분당 {CONSERVATIVE_READING_WPM}단어)로 계산합니다. 한국어
            과제의 단어 수는 어절 기준 추정치이며 실제 읽기 속도는 학생의 연령과 언어에 따라
            다를 수 있습니다.
          </p>
        </details>
      </div>
    </section>
  );
}
