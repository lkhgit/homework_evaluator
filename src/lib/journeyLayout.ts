import type { EngineReport, TimingVerdict } from "@/lib/engine";
import type { Analysis } from "@/lib/schema";

/**
 * Turns the task graph into coordinates for the journey diagram.
 *
 * Nothing here is asked of the model. The graph already says, step by step,
 * where the student is (environment), what they must carry (the engine's
 * carried items) and which clock is running (time constraints). Steps are a
 * linear sequence, so the layout is fixed rather than solved: column = order,
 * lane = environment.
 */

export const LANE_LABEL_W = 136;
export const COL_W = 224;
export const NODE_W = 188;
export const NODE_H = 132;
export const LANE_H = 172;
const TRACK_ROW_H = 28;
const EDGE_PAD = 24;

export interface LayoutLane {
  environment: string;
  index: number;
  top: number;
}

export interface LayoutNode {
  stepId: string;
  index: number;
  laneIndex: number;
  x: number;
  y: number;
}

export interface LayoutFlowEdge {
  fromId: string;
  toId: string;
  switchesLane: boolean;
  path: string;
}

export interface LayoutMemoryEdge {
  item: string;
  label: string;
  fromId: string;
  toId: string;
  decayRisk: boolean;
  x1: number;
  x2: number;
  y: number;
}

export interface LayoutTimer {
  id: string;
  limitMinutes: number;
  verdict: Exclude<TimingVerdict, "untimed">;
  x1: number;
  x2: number;
  y: number;
}

export interface JourneyLayout {
  lanes: LayoutLane[];
  nodes: LayoutNode[];
  flowEdges: LayoutFlowEdge[];
  memoryEdges: LayoutMemoryEdge[];
  timers: LayoutTimer[];
  /** Where the memory track starts, below the last lane; null when nothing is carried. */
  memoryTrackTop: number | null;
  lanesTop: number;
  lanesBottom: number;
  width: number;
  height: number;
}

/** Greedy interval packing: each span gets the first row whose last span ended before it starts. */
function assignRows<T extends { start: number; end: number }>(spans: T[]): Array<T & { row: number }> {
  const rowEnds: number[] = [];
  return [...spans]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((span) => {
      let row = rowEnds.findIndex((end) => end < span.start);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(span.end);
      } else {
        rowEnds[row] = span.end;
      }
      return { ...span, row };
    });
}

export function buildJourneyLayout(analysis: Analysis, report: EngineReport): JourneyLayout {
  const steps = analysis.steps;
  const indexById = new Map(steps.map((step, index) => [step.id, index]));

  // Same normalisation as analyzeSwitching, so lanes match the environment count shown above.
  const environments = steps.map((step) => step.environment.trim());
  const laneNames = [...new Set(environments)];
  const laneOf = new Map(laneNames.map((name, index) => [name, index]));

  const columnX = (index: number) => LANE_LABEL_W + index * COL_W;
  const centerX = (index: number) => columnX(index) + NODE_W / 2;

  // Timers sit above the lanes, one row per overlapping clock.
  const timerSpans = report.timing.constraints.flatMap((constraint) => {
    const indexes = constraint.stepIds
      .map((id) => indexById.get(id))
      .filter((index): index is number => index !== undefined);
    if (indexes.length === 0) return [];
    return [{ constraint, start: Math.min(...indexes), end: Math.max(...indexes) }];
  });
  const packedTimers = assignRows(timerSpans);
  const timerRows = packedTimers.reduce((max, span) => Math.max(max, span.row + 1), 0);
  const lanesTop = timerRows > 0 ? 12 + timerRows * TRACK_ROW_H + 8 : 12;

  const lanes: LayoutLane[] = laneNames.map((environment, index) => ({
    environment,
    index,
    top: lanesTop + index * LANE_H,
  }));
  const lanesBottom = lanesTop + laneNames.length * LANE_H;

  const nodes: LayoutNode[] = steps.map((step, index) => {
    const laneIndex = laneOf.get(environments[index]) ?? 0;
    return {
      stepId: step.id,
      index,
      laneIndex,
      x: columnX(index),
      y: lanes[laneIndex].top + (LANE_H - NODE_H) / 2,
    };
  });

  const flowEdges: LayoutFlowEdge[] = nodes.slice(1).map((to, offset) => {
    const from = nodes[offset];
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const switchesLane = from.laneIndex !== to.laneIndex;
    const midX = (x1 + x2) / 2;
    return {
      fromId: from.stepId,
      toId: to.stepId,
      switchesLane,
      path: switchesLane ? `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` : `M ${x1} ${y1} H ${x2}`,
    };
  });

  const timers: LayoutTimer[] = packedTimers.map(({ constraint, start, end, row }) => ({
    id: constraint.id,
    limitMinutes: constraint.limitMinutes,
    verdict: constraint.verdict,
    x1: columnX(start),
    x2: columnX(end) + NODE_W,
    y: 12 + row * TRACK_ROW_H + TRACK_ROW_H / 2,
  }));

  // Carried items get their own track below the lanes, aligned to the step columns.
  const memorySpans = report.memory.carried.flatMap((item) => {
    const start = indexById.get(item.producedAtStepId);
    const end = indexById.get(item.consumedAtStepId);
    if (start === undefined || end === undefined || end <= start) return [];
    return [{ item, start, end }];
  });
  const packedMemory = assignRows(memorySpans);
  const memoryRows = packedMemory.reduce((max, span) => Math.max(max, span.row + 1), 0);
  const memoryTrackTop = memoryRows > 0 ? lanesBottom + 12 : null;

  const memoryEdges: LayoutMemoryEdge[] = packedMemory.map(({ item, start, end, row }) => ({
    item: item.id,
    label: item.id.replace(/_/g, " "),
    fromId: item.producedAtStepId,
    toId: item.consumedAtStepId,
    decayRisk: item.decayRisk,
    x1: centerX(start),
    x2: centerX(end),
    y: (memoryTrackTop ?? 0) + 24 + row * TRACK_ROW_H,
  }));

  const width = steps.length > 0 ? columnX(steps.length - 1) + NODE_W + EDGE_PAD : LANE_LABEL_W;
  const height = memoryTrackTop !== null ? memoryTrackTop + 24 + memoryRows * TRACK_ROW_H : lanesBottom + 12;

  return { lanes, nodes, flowEdges, memoryEdges, timers, memoryTrackTop, lanesTop, lanesBottom, width, height };
}
