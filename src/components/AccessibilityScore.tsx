import { ChevronDown } from "lucide-react";

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
        <p className="eyebrow">과제 접근성 신뢰도</p>
        <div className="score-value" aria-label={`100점 만점에 ${score}점`}>
          <span>{score}</span>
          <span>/ 100</span>
        </div>
      </div>
      <div className="score-disclosure">
        <p id="confidence-title">
          이 점수는 법적 준수 여부가 아니라 과제 수준의 접근성 마찰을 반영합니다.
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
        </details>
      </div>
    </section>
  );
}
