"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { taskFlowLayout } from "@/lib/taskFlowLayout";

const ROW_HEIGHT = 132;
const COLUMN_GAP = 40;

export default function StudentFlow({ steps, selected, onSelect, submissionCheck = true, detailId = "student-step-detail" }: {
  steps: readonly { action: string; environment?: string }[];
  submissionCheck?: boolean;
  detailId?: string;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const currentStep = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const items = steps.map(step => ({
    action: step.action,
    category: step.environment?.trim() || "과제 활동",
  }));
  if (submissionCheck) items.push({ action: "제출 전 점검", category: "제출 점검" });
  const { lanes, steps: positions } = taskFlowLayout(items.map(item => item.category));

  useEffect(() => {
    const scroller = viewport.current;
    const button = currentStep.current;
    if (!scroller || !button) return;
    const area = scroller.getBoundingClientRect();
    const card = button.getBoundingClientRect();
    const labelWidth = scroller.querySelector(".flow-lane-label")?.getBoundingClientRect().width ?? 0;
    const left = area.left + labelWidth + 8;
    const right = area.left + scroller.clientWidth - 8;
    const bottom = area.top + scroller.clientHeight - 8;

    // Move only the diagram. The selected detail owns the page's focus.
    scroller.scrollBy({
      left: card.left < left ? card.left - left : Math.max(0, card.right - right),
      top: card.top < area.top + 8 ? card.top - area.top - 8 : Math.max(0, card.bottom - bottom),
      behavior: "instant",
    });
  }, [selected]);

  if (items.length === 0) return null;

  return (
    <nav className="student-flow" aria-label="과제 수행 순서">
      <p id={hintId} className="flow-instruction">화살표를 따라 진행하세요. 순서도를 좌우로 이동하거나, 단계를 선택해 상세 내용을 볼 수 있습니다.</p>
      <div ref={viewport} className="flow-viewport" role="region" aria-label="수행 순서도" aria-describedby={hintId} tabIndex={0}>
        <ol role="list" className="student-flow-track" style={{
          "--flow-row-height": `${ROW_HEIGHT}px`,
          "--flow-gap": `${COLUMN_GAP}px`,
          gridTemplateColumns: `var(--flow-label-width) repeat(${items.length}, var(--flow-card-width))`,
        } as CSSProperties}>
          {lanes.map((lane, row) => (
            <li key={lane} className="flow-lane" style={{ gridRow: row + 1 }} aria-hidden="true" role="presentation" />
          ))}
          {lanes.map((lane, row) => (
            <li key={lane} className="flow-lane-label" style={{ gridRow: row + 1 }} aria-hidden="true" role="presentation">{lane}</li>
          ))}
          {items.map(({ action, category }, index) => {
            const { row, nextRow } = positions[index];
            const active = index === selected;
            const offset = nextRow === undefined ? 0 : (nextRow - row) * ROW_HEIGHT;
            const startY = Math.max(0, -offset) + 8;
            const endY = startY + offset;
            const bend = COLUMN_GAP / 2;
            const endX = COLUMN_GAP - 3;
            return (
              <li key={index} className="flow-step" style={{ gridColumn: index + 2, gridRow: row + 1 }}>
                <button
                  ref={active ? currentStep : undefined}
                  type="button"
                  className={active ? "flow-node is-selected" : "flow-node"}
                  aria-label={`${index + 1}단계, ${category}. ${action}`}
                  aria-current={active ? "step" : undefined}
                  aria-controls={detailId}
                  title={action}
                  onClick={() => onSelect(index)}
                >
                  <span className="flow-node-heading">
                    <span className="student-flow-number">{String(index + 1).padStart(2, "0")}</span>
                    {active && <span className="flow-node-action"><Check size={13} aria-hidden="true" />선택됨</span>}
                  </span>
                  <strong>{action}</strong>
                </button>
                {nextRow !== undefined && (
                  <svg className={offset ? "flow-arrow flow-arrow--switch" : "flow-arrow"}
                    width={COLUMN_GAP} height={Math.abs(offset) + 16}
                    style={{ top: `calc(50% - ${startY}px)` }} aria-hidden="true">
                    <path d={`M 0 ${startY} H ${bend} V ${endY} H ${endX} M ${endX - 5} ${endY - 5} L ${endX} ${endY} L ${endX - 5} ${endY + 5}`} />
                  </svg>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
