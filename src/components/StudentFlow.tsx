"use client";

import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { snakePosition } from "@/lib/snakePosition";


export default function StudentFlow({ steps, selected, onSelect, submissionCheck = true, detailId = "student-step-detail" }: {
  steps: readonly { action: string; environment?: string }[];
  submissionCheck?: boolean;
  detailId?: string;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const labels = [...steps.map(step => step.action), ...(submissionCheck ? ["제출 전 점검"] : [])];
  return <nav className="student-flow" aria-label="과제 수행 순서">
    <p className="flow-instruction">단계를 누르면 아래에서 자세한 활동을 확인합니다.</p>
    <ol className="student-flow-track">{labels.map((label, index) => <li key={index} style={{ "--flow-col": snakePosition(index, 3).column + 1, "--flow-row": snakePosition(index, 3).row + 1, "--flow-col-tablet": snakePosition(index, 2).column + 1, "--flow-row-tablet": snakePosition(index, 2).row + 1 } as CSSProperties}>
      <button type="button" className={`journey-card flow-node${selected === index ? " is-selected" : ""}`}
        aria-current={selected === index ? "step" : undefined} aria-controls={detailId}
        onClick={() => onSelect(index)}>
        <span className="flow-node-heading"><span className="student-flow-number" aria-hidden="true">{index + 1}</span><span className="flow-node-action">{selected === index ? "선택한 단계" : "상세 보기"}</span></span>
        <strong>{label}</strong>
        {steps[index]?.environment && <span className="flow-environment">{steps[index].environment}</span>}
      </button>
      {index < labels.length - 1 && [3, 2, 1].map(columns => {
        const direction = snakePosition(index, columns).direction;
        const Arrow = direction === "down" ? ArrowDown : direction === "left" ? ArrowLeft : ArrowRight;
        return <Arrow key={columns} className={`flow-arrow flow-arrow--${columns} flow-arrow--${direction}`} aria-hidden="true" size={32} />;
      })}
    </li>)}</ol>
  </nav>;
}
