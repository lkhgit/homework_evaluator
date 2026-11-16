import type { ConditionId, WorkflowStage } from "@/components/WorkflowContext";
import type { Analysis, RevisedAssignment, Step } from "./schemaTypes";

/**
 * The workflow saved in this browser only (localStorage), so a refresh or a
 * closed tab during a demo does not lose an analysis that cost model calls.
 * Nothing is sent anywhere. Stored data is untrusted on the way back in: it
 * may be from an older build or edited by hand, so it is shape-checked and
 * dropped whole when anything is off.
 */
export const AUTOSAVE_KEY = "accesslens:workflow:v1";
export const GUIDE_DISMISSED_KEY = "accesslens:guide-dismissed:v1";

const STAGES: readonly WorkflowStage[] = [
  "analyze", "goal", "journey", "barrier", "repair", "constraint", "preview", "complete",
];
const CONDITIONS: readonly ConditionId[] = [
  "working_memory", "keyboard_only", "fine_motor", "no_spoken", "no_audio", "no_color", "processing_time", "reduced_motion",
];

export interface WorkflowSnapshot {
  version: 1;
  savedAt: number;
  stage: WorkflowStage;
  assignmentDraft: string;
  analyzedText: string;
  objective: string;
  analyzedObjective: string;
  baseAnalysis: Analysis;
  steps: Step[];
  appliedRepairIds: string[];
  revisions: Record<string, RevisedAssignment>;
  visited: WorkflowStage[];
  selectedFrictionId: string | null;
  condition: ConditionId;
  currentAnalysisKey: string;
  /** Whether repair proposals had arrived for the saved analysis. */
  repairsReady: boolean;
}

/** Stages that cannot be resumed into fall back to the nearest one that can. */
export function resumableStage(stage: WorkflowStage): WorkflowStage {
  if (stage === "intro") return "analyze";
  if (stage === "loading") return "goal";
  return stage;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isAnalysisShape(value: unknown): value is Analysis {
  return (
    isRecord(value) &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => isRecord(step) && isString(step.id) && isString(step.action) && isRecord(step.demands)) &&
    Array.isArray(value.frictionMoments) &&
    Array.isArray(value.timeConstraints)
  );
}

function isRevision(value: unknown): value is RevisedAssignment {
  return isRecord(value) && isString(value.title) && isString(value.revisedText);
}

export function parseSnapshot(raw: string | null): WorkflowSnapshot | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== 1 || typeof data.savedAt !== "number") return null;
  const strings = ["assignmentDraft", "analyzedText", "objective", "analyzedObjective", "currentAnalysisKey"] as const;
  if (!strings.every((key) => isString(data[key]))) return null;
  if (!STAGES.includes(data.stage as WorkflowStage)) return null;
  if (!CONDITIONS.includes(data.condition as ConditionId)) return null;
  if (!isAnalysisShape(data.baseAnalysis)) return null;
  if (!isAnalysisShape({ ...data.baseAnalysis, steps: data.steps })) return null;
  if (!isStringArray(data.appliedRepairIds) || !isStringArray(data.visited)) return null;
  if (!(data.selectedFrictionId === null || isString(data.selectedFrictionId))) return null;
  if (!isRecord(data.revisions) || !Object.values(data.revisions).every(isRevision)) return null;
  if (typeof data.repairsReady !== "boolean") return null;
  return {
    ...(data as unknown as WorkflowSnapshot),
    visited: (data.visited as string[]).filter((stage): stage is WorkflowStage => STAGES.includes(stage as WorkflowStage)),
  };
}

export function readSnapshot(): WorkflowSnapshot | null {
  try {
    return parseSnapshot(window.localStorage.getItem(AUTOSAVE_KEY));
  } catch {
    return null; // Storage disabled (private mode, policy): autosave is simply off.
  }
}

export function writeSnapshot(snapshot: WorkflowSnapshot): boolean {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false; // Quota or disabled storage; the session keeps working unsaved.
  }
}

export function clearSnapshot(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function savedAtLabel(savedAt: number, now = Date.now()): string {
  const minutes = Math.round((now - savedAt) / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(savedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
