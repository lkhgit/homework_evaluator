"use client";

import { Check, CircleHelp } from "lucide-react";
import type { WorkflowStage } from "@/components/WorkflowContext";

const PROGRESS = [
  // Named for the stage, not the action: every other entry is a place you can
  // stand ("Goal Lock", "Journey Scan"), so calling this one "New Analysis"
  // made stepping back to it read as though it would discard your work.
  { number: 1, label: "과제", target: "analyze", stages: ["analyze", "loading"] },
  { number: 2, label: "목표 확정", target: "goal", stages: ["goal"] },
  { number: 3, label: "활동 분석", target: "journey", stages: ["journey"] },
  { number: 4, label: "문제 지점", target: "barrier", stages: ["barrier"] },
  { number: 5, label: "개선", target: "repair", stages: ["repair"] },
  // Optional: the repair screen can go straight to the preview.
  { number: 6, label: "검증", target: "constraint", stages: ["constraint"], optional: true },
  { number: 7, label: "미리보기", target: "preview", stages: ["preview"] },
] as const;

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? "logo-mark--small" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export { LogoMark };

interface AppNavProps {
  stage: WorkflowStage;
  visited: ReadonlySet<WorkflowStage>;
  onNavigate: (stage: WorkflowStage) => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
}

export default function AppNav({ stage, visited, onNavigate, helpOpen, onToggleHelp }: AppNavProps) {
  // Completion is the state after the seven-step workflow, not another name
  // for Preview. Advancing the index past the final item marks every step as
  // complete without incorrectly exposing any of them as aria-current.
  const activeIndex = stage === "complete"
    ? PROGRESS.length
    : PROGRESS.findIndex((item) =>
        (item.stages as readonly WorkflowStage[]).includes(stage),
      );

  return (
    <header className="app-nav">
      <div className="brand-lockup" aria-label="AccessLens">
        <LogoMark small />
        <span>AccessLens</span>
      </div>

      <nav aria-label="분석 진행 단계" className="progress-nav">
        <ol>
          {PROGRESS.map((item, index) => {
            const active = index === activeIndex;
            const optional = "optional" in item && item.optional;
            // A skipped optional step is passed, not completed: no check mark.
            const complete = index < activeIndex && (!optional || visited.has(item.target));
            // Only offer a jump to somewhere the educator has actually been.
            // A stepper that looks clickable but is not is worse than a plain one.
            const reachable = !active && visited.has(item.target);

            const inner = (
              <>
                <span className="progress-number" aria-hidden="true">
                  {complete ? <Check size={11} strokeWidth={2.4} /> : item.number}
                </span>
                <span className="progress-label">
                  {item.label}
                  {optional && <span className="progress-optional"> (선택)</span>}
                </span>
              </>
            );

            return (
              <li
                key={item.number}
                className={active ? "is-active" : complete ? "is-complete" : ""}
                aria-current={active ? "step" : undefined}
              >
                {reachable ? (
                  <button
                    type="button"
                    className="progress-link"
                    onClick={() => onNavigate(item.target)}
                  >
                    {inner}
                    <span className="sr-only">, 이 단계로 돌아가기</span>
                  </button>
                ) : (
                  <span className="progress-link progress-link--static">
                    {inner}
                    {active && <span className="sr-only">, 현재 단계</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        className="help-toggle"
        aria-expanded={helpOpen}
        aria-controls="first-run-guide"
        onClick={onToggleHelp}
      >
        <CircleHelp size={17} aria-hidden="true" /> 도움말
      </button>
    </header>
  );
}
