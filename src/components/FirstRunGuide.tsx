import { X } from "lucide-react";

const STEPS = [
  { title: "과제를 넣습니다", body: "과제 안내문을 붙여넣거나 PDF를 올립니다. 샘플 과제는 API 키 없이 바로 써 볼 수 있습니다." },
  { title: "학습 목표를 확정합니다", body: "AI가 찾은 학습 목표를 확인하고 고칩니다. 이후 판단은 모두 이 목표가 기준입니다." },
  { title: "막히는 곳을 고칩니다", body: "학생의 활동 목록과 문제 지점을 보고 목표를 지키는 개선안만 채택해 학생용 활동지로 내보냅니다." },
];

const GLOSSARY = [
  { term: "활동 목록", body: "학생이 과제를 끝내기까지 실제로 하는 행동을 순서대로 나눈 것." },
  { term: "문제 지점", body: "기억, 손 조작, 시간 제한, 읽기량, 감각 하나에만 기대는 안내처럼 학생을 막을 수 있는 부담." },
  { term: "접근성 점수", body: "100점이면 찾은 문제가 없다는 뜻입니다. 법적 준수나 통계적 신뢰도를 나타내지 않습니다." },
  { term: "개선안", body: "학습 목표는 그대로 두고 불필요한 부담만 줄이는 수정 제안. 채택해야 반영됩니다." },
  { term: "검증 (선택)", body: "기억력 부담, 키보드만 쓰는 상황 같은 조건에서 과제가 어디서 막히는지 시험합니다." },
];

/** Three steps and a short glossary. Shown on first use, reopened from 도움말. */
export default function FirstRunGuide({ onClose }: { onClose: () => void }) {
  return (
    <section className="first-run-guide" id="first-run-guide" aria-labelledby="guide-title">
      <div className="first-run-guide__head">
        <h2 id="guide-title">AccessLens는 이렇게 씁니다</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="사용 안내 닫기">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <ol className="first-run-guide__steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="first-run-guide__num" aria-hidden="true">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <details className="first-run-guide__glossary">
        <summary>용어 풀이</summary>
        <dl>
          {GLOSSARY.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
