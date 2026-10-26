import type { Analysis, ObjectiveCandidate, Repair, RevisedAssignment } from "./schema";
import { SAMPLES } from "@/samples/biology";

/**
 * Where analysis comes from. Samples resolve locally so the demo runs instantly
 * and offline; anything else goes to the API routes. Phase 2 fills in the
 * routes — until then a pasted assignment surfaces a clear message rather than
 * failing silently.
 */

function matchSample(text: string) {
  const normalized = text.trim();
  return SAMPLES.find((sample) => sample.text.trim() === normalized);
}

export class AnalysisUnavailableError extends Error {}

export interface AnalysisResult {
  analysis: Analysis;
  warnings: string[];
}

export async function extractObjectives(text: string): Promise<ObjectiveCandidate[]> {
  const sample = matchSample(text);
  if (sample) return sample.objectives;

  const data = await post<{ objectives: ObjectiveCandidate[] }>("/api/objective", {
    assignmentText: text,
  });
  return data.objectives;
}

export async function analyzeAssignment(
  text: string,
  lockedObjective: string
): Promise<AnalysisResult> {
  const sample = matchSample(text);
  if (sample) return { analysis: sample.analysis, warnings: [] };

  return post<AnalysisResult>("/api/analyze", { assignmentText: text, lockedObjective });
}

export async function classifyRepair(
  lockedObjective: string,
  analysis: Analysis,
  stepId: string,
  suggestion: string
): Promise<Repair> {
  return post<Repair>("/api/repair", {
    lockedObjective,
    analysis,
    stepId,
    suggestion,
  });
}

export interface AcceptedRepair {
  action: string;
  suggestion: string;
  rigorNote: string;
}

/**
 * Rewrites the assignment with only the accepted repairs applied. Unlike the
 * other two calls this has no sample shortcut: the revision depends on which
 * repairs the educator actually accepted, so a cached answer would be a
 * fabrication rather than a shortcut.
 */
export async function generatePreview(
  assignmentText: string,
  lockedObjective: string,
  repairs: AcceptedRepair[]
): Promise<RevisedAssignment> {
  return post<RevisedAssignment>("/api/preview", {
    assignmentText,
    lockedObjective,
    repairs,
  });
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!response) {
    throw new AnalysisUnavailableError(
      "분석 서비스에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해주세요."
    );
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((data: { error?: string }) => data.error)
      .catch(() => null);
    throw new AnalysisUnavailableError(
      message ?? "분석 서비스에서 오류가 발생했습니다. 다시 시도해주세요."
    );
  }

  return (await response.json()) as T;
}
