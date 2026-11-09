"use client";

import { AlertTriangle, Check } from "lucide-react";
import { forwardRef, useMemo } from "react";

import type { EngineReport } from "@/lib/engine";
import { buildJourneyLayout, LANE_H, NODE_H, NODE_W } from "@/lib/journeyLayout";
import type { Analysis, FrictionMoment, GoalRelevance, Step } from "@/lib/schema";

type Severity = FrictionMoment["severity"];

export interface JourneyDiagramProps {
  analysis: Analysis;
  report: EngineReport;
  selectedStepId: string | undefined;
  frictionByStep: Map<string, FrictionMoment[]>;
  onSelect: (index: number) => void;
  nodeLabel: (step: Step) => string;
  relevanceLabel: Record<GoalRelevance, string>;
  severityLabel: Record<Severity, string>;
}

/**
 * The student's journey as a swimlane flowchart: one column per step, one lane
 * per environment. Lines between lanes are context switches, the dashed track
 * underneath is what the student has to carry in their head, and brackets on
 * top are running clocks. Everything is drawn from the task graph and the
 * engine report; no part of the picture comes from the model directly.
 *
 * Steps are real buttons laid over the SVG in step order, so keyboard and
 * screen-reader users move through the same sequence the picture shows.
 */
const JourneyDiagram = forwardRef<HTMLDivElement, JourneyDiagramProps>(function JourneyDiagram(
  { analysis, report, selectedStepId, frictionByStep, onSelect, nodeLabel, relevanceLabel, severityLabel },
  ref,
) {
  const layout = useMemo(() => buildJourneyLayout(analysis, report), [analysis, report]);
  const stepById = useMemo(() => new Map(analysis.steps.map((step) => [step.id, step])), [analysis]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((node) => [node.stepId, node])), [layout]);
  const switches = layout.flowEdges.filter((edge) => edge.switchesLane).length;

  return (
    <div className="journey-diagram-wrap">
      <p className="sr-only">
        학습 환경 {layout.lanes.length}곳, 환경 전환 {switches}회, 기억해서 가져가야 하는 정보 {layout.memoryEdges.length}개.
      </p>
      <div
        ref={ref}
        className="journey-diagram"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          className="journey-diagram-svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          aria-hidden="true"
        >
          <defs>
            <marker id="jd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="jd-arrow-head" />
            </marker>
            <marker id="jd-arrow-switch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="jd-arrow-head jd-arrow-head--switch" />
            </marker>
          </defs>

          {layout.lanes.map((lane) => (
            <g key={lane.environment}>
              <rect
                className={`jd-lane${lane.index % 2 === 1 ? " jd-lane--alt" : ""}`}
                x={0}
                y={lane.top}
                width={layout.width}
                height={LANE_H}
              />
              <text className="jd-lane-label" x={14} y={lane.top + LANE_H / 2} dominantBaseline="middle">
                {lane.environment.length > 14 ? `${lane.environment.slice(0, 13)}…` : lane.environment}
                <title>{lane.environment}</title>
              </text>
            </g>
          ))}

          {layout.timers.map((timer) => (
            <g key={timer.id} className={`jd-timer jd-timer--${timer.verdict}`}>
              <path d={`M ${timer.x1} ${timer.y + 8} V ${timer.y} H ${timer.x2} V ${timer.y + 8}`} />
              <text x={timer.x1 + 8} y={timer.y - 5}>
                타이머 {timer.limitMinutes}분
                {timer.verdict === "infeasible" ? " · 시간 부족" : timer.verdict === "tight" ? " · 빠듯함" : ""}
              </text>
            </g>
          ))}

          {layout.flowEdges.map((edge) => (
            <path
              key={`${edge.fromId}-${edge.toId}`}
              className={`jd-flow${edge.switchesLane ? " jd-flow--switch" : ""}`}
              d={edge.path}
              markerEnd={`url(#${edge.switchesLane ? "jd-arrow-switch" : "jd-arrow"})`}
            />
          ))}

          {layout.memoryTrackTop !== null && (
            <text className="jd-track-label" x={14} y={layout.memoryTrackTop + 14}>
              기억해야 하는 정보
            </text>
          )}
          {layout.memoryEdges.map((edge) => {
            const from = nodeById.get(edge.fromId);
            const to = nodeById.get(edge.toId);
            return (
              <g key={edge.item} className={`jd-memory${edge.decayRisk ? " jd-memory--risk" : ""}`}>
                {from && <line className="jd-memory-guide" x1={edge.x1} y1={from.y + NODE_H} x2={edge.x1} y2={edge.y} />}
                {to && <line className="jd-memory-guide" x1={edge.x2} y1={to.y + NODE_H} x2={edge.x2} y2={edge.y} />}
                <line className="jd-memory-span" x1={edge.x1} y1={edge.y} x2={edge.x2} y2={edge.y} />
                <circle cx={edge.x1} cy={edge.y} r={3.5} />
                <circle cx={edge.x2} cy={edge.y} r={3.5} />
                <text x={(edge.x1 + edge.x2) / 2} y={edge.y - 6} textAnchor="middle">{edge.label}</text>
              </g>
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const step = stepById.get(node.stepId)!;
          const frictions = frictionByStep.get(step.id) ?? [];
          const primary = frictions[0];
          const selected = step.id === selectedStepId;
          const number = String(node.index + 1).padStart(2, "0");
          const status = primary ? `어려움 ${severityLabel[primary.severity]}` : "어려움 없음";
          return (
            <button
              key={step.id}
              type="button"
              data-step-id={step.id}
              className={`journey-card journey-node${selected ? " is-selected" : ""}${primary ? ` has-friction severity-border-${primary.severity}` : ""}`}
              style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
              onClick={() => onSelect(node.index)}
              aria-current={selected ? "step" : undefined}
              aria-controls="journey-step-detail"
              aria-label={`${node.index + 1}단계, ${step.environment}, 목표와의 관련성 ${relevanceLabel[step.goalRelevance]}, ${status}. ${step.action}`}
            >
              <span className="journey-card-topline">
                <span className="node-number">{number}</span>
                <span className={`relevance-pill relevance-${step.goalRelevance}`}>{relevanceLabel[step.goalRelevance]}</span>
              </span>
              <strong className="node-label">{nodeLabel(step)}</strong>
              {primary ? (
                <span className={`journey-status severity-${primary.severity}`}>
                  <AlertTriangle size={13} aria-hidden="true" />
                  {severityLabel[primary.severity]}
                  {frictions.length > 1 && <small>{frictions.length}건</small>}
                </span>
              ) : (
                <span className="journey-status journey-status--clear"><Check size={13} aria-hidden="true" /> 어려움 없음</span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="journey-legend" aria-label="다이어그램 범례">
        <li><i className="jd-key jd-key--flow" aria-hidden="true" /> 다음 단계로 진행</li>
        <li><i className="jd-key jd-key--switch" aria-hidden="true" /> 환경 전환</li>
        <li><i className="jd-key jd-key--memory" aria-hidden="true" /> 기억해서 가져가야 하는 정보</li>
        <li><i className="jd-key jd-key--risk" aria-hidden="true" /> 환경을 옮기면 사라지는 정보</li>
        <li><i className="jd-key jd-key--timer" aria-hidden="true" /> 타이머 구간</li>
      </ul>
    </div>
  );
});

export default JourneyDiagram;
