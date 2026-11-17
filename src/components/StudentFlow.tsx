"use client";

import { ArrowLeft, ArrowRight, ClipboardCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import type { StudentAnalysis } from "@/lib/studentAnalysis";

export default function StudentFlow({ steps, selected, onSelect }: {
  steps: StudentAnalysis["steps"];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scroll.current;
    const node = container?.querySelector<HTMLElement>(`[data-flow-step="${selected}"]`);
    if (container && node) container.scrollTo({ left: node.offsetLeft - container.offsetLeft - (container.clientWidth - node.clientWidth) / 2 });
  }, [selected]);
  const labels = [...steps.map(step => step.action), "제출 전 점검"];
  return <section className="journey-explorer student-flow" aria-label="과제 수행 순서도">
    <div className="journey-toolbar"><div><p className="eyebrow">전체 수행 순서</p><h2>이 순서대로 진행하세요</h2><p>단계를 선택하면 아래에서 준비물과 주의사항을 확인할 수 있습니다.</p></div>
      <div className="journey-controls"><span>{selected + 1} / {labels.length}</span><button type="button" aria-label="이전 단계" disabled={selected === 0} onClick={() => onSelect(selected - 1)}><ArrowLeft size={17} aria-hidden="true" /></button><button type="button" aria-label="다음 단계" disabled={selected === steps.length} onClick={() => onSelect(selected + 1)}><ArrowRight size={17} aria-hidden="true" /></button></div>
    </div>
    <div className="journey-scroll student-flow-scroll" ref={scroll}>
      <ol className="student-flow-track">{labels.map((label, index) => <li key={index}>
        <button type="button" data-flow-step={index} className={`journey-card student-flow-node${selected === index ? " is-selected" : ""}`} aria-current={selected === index ? "step" : undefined} aria-controls="student-step-detail" aria-label={`${index === steps.length ? "마지막" : `${index + 1}단계`}: ${label}`} onClick={() => onSelect(index)}>
          <span className="journey-card-topline"><span className="node-number">{index === steps.length ? <ClipboardCheck size={22} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span><span className="student-flow-node-type">{index === steps.length ? "제출" : "수행"}</span></span>
          <strong className="node-label" title={label}>{label}</strong><span className="student-flow-node-hint">{selected === index ? "아래에서 확인 중" : "상세 안내 보기"}</span>
        </button>
        {index < steps.length && <ArrowRight className="student-flow-arrow" size={28} aria-hidden="true" />}
      </li>)}</ol>
    </div>
  </section>;
}
