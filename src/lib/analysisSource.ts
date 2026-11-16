import type { Analysis, ObjectiveCandidate, Repair, RevisedAssignment } from "./schemaTypes";
import { SAMPLES } from "@/samples/biology";
import { analysisKey, objectiveChanged } from "./workflowState";

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

/**
 * The bundled analysis for a sample, but only for the objective it was judged
 * against. Goal relevance and every proposed repair depend on that objective,
 * so returning the cached graph for an edited objective would show the
 * educator results for a goal they had just changed.
 */
export function sampleAnalysisFor(text: string, lockedObjective: string) {
  const sample = matchSample(text);
  if (!sample) return null;
  return objectiveChanged(lockedObjective, sample.analysisObjective) ? null : sample;
}

export class AnalysisUnavailableError extends Error {}

/** The educator cancelled the request; not a failure to report as one. */
export class AnalysisCancelledError extends Error {
  constructor() {
    super("요청을 취소했습니다. 입력한 내용은 그대로 남아 있습니다.");
  }
}

/**
 * Longer than the slowest route may run (analyze: maxDuration 300 s), so the
 * browser only gives up after the server would have, and the loading screen
 * always ends.
 */
export const CLIENT_TIMEOUT_MS = 310_000;

export const TIMEOUT_MESSAGE =
  "분석 서비스가 3분 넘게 응답하지 않아 요청을 중단했습니다. 과제가 길다면 일부를 줄여 다시 시도해 주세요.";

export interface RequestOptions {
  /** Aborted when the educator cancels. */
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface AnalysisResult {
  analysis: Analysis;
  warnings: string[];
}

export async function extractObjectives(text: string, options: RequestOptions = {}): Promise<ObjectiveCandidate[]> {
  const sample = matchSample(text);
  if (sample) return sample.objectives;

  const data = await post<{ objectives: ObjectiveCandidate[] }>("/api/objective", {
    assignmentText: text,
  }, options);
  return data.objectives;
}

/** Whether this text and objective are answered by the bundled sample, offline. */
export function isSampleRequest(text: string, lockedObjective: string): boolean {
  return sampleAnalysisFor(text, lockedObjective) !== null;
}

/**
 * The server returns the graph and its repair proposals in one response.
 * The screens show the graph first and attach proposals as a second step, so
 * the proposals are held here until fetchRepairs asks for them.
 */
const pendingRepairs = new Map<string, RepairsResult>();

export async function analyzeAssignment(
  text: string,
  lockedObjective: string,
  options: RequestOptions = {}
): Promise<AnalysisResult> {
  const sample = sampleAnalysisFor(text, lockedObjective);
  // The sample's graph is served without its repairs, so both paths go
  // through the same second step and the same screens.
  if (sample) return { analysis: withoutRepairs(sample.analysis), warnings: [] };
  const result = await post<AnalysisResult>("/api/analyze", { assignmentText: text, lockedObjective }, options);
  const repairs: Record<string, Repair> = {};
  for (const step of result.analysis.steps) if (step.repair) repairs[step.id] = step.repair;
  pendingRepairs.set(analysisKey(text, lockedObjective), { repairs, warnings: [] });
  return { analysis: withoutRepairs(result.analysis), warnings: result.warnings };
}

function withoutRepairs(analysis: Analysis): Analysis {
  return { ...analysis, steps: analysis.steps.map((step) => ({ ...step, repair: null })) };
}

export interface RepairsResult {
  repairs: Record<string, Repair>;
  warnings: string[];
}

/**
 * The repair proposals for a graph already on screen. They arrived with the
 * analysis, so no request is made; the sample answers with its bundled ones.
 */
export async function fetchRepairs(
  text: string,
  lockedObjective: string,
  _analysis: Analysis,
  options: RequestOptions = {}
): Promise<RepairsResult> {
  void _analysis;
  if (options.signal?.aborted) throw new AnalysisCancelledError();
  const sample = sampleAnalysisFor(text, lockedObjective);
  if (sample) {
    const repairs: Record<string, Repair> = {};
    for (const step of sample.analysis.steps) if (step.repair) repairs[step.id] = step.repair;
    return { repairs, warnings: [] };
  }
  const held = pendingRepairs.get(analysisKey(text, lockedObjective));
  if (!held) {
    throw new AnalysisUnavailableError("이 분석의 개선안을 찾을 수 없습니다. 목표 화면에서 '다시 분석'을 눌러 주세요.");
  }
  return held;
}

/** Classifies a teacher-written repair against the analysis on screen. */
export async function classifyRepair(
  lockedObjective: string,
  analysis: Analysis,
  stepId: string,
  suggestion: string
): Promise<Repair> {
  return post<Repair>("/api/repair", { lockedObjective, analysis, stepId, suggestion });
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
  repairs: AcceptedRepair[],
  options: RequestOptions & { steps?: ReadonlyArray<{ id: string; action: string }> } = {}
): Promise<RevisedAssignment> {
  // The step list lets the server quote, per step, the rewritten sentence the
  // student follows; the student guide is built from those excerpts.
  return post<RevisedAssignment>("/api/preview", {
    assignmentText,
    lockedObjective,
    repairs,
    steps: options.steps ?? [],
  }, options);
}

/**
 * POSTs JSON with a bounded wait. A cancel from the educator and a timeout are
 * told apart, so the screen can say which one happened.
 */
export async function post<T>(url: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  if (options.signal?.aborted) throw new AnalysisCancelledError();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? CLIENT_TIMEOUT_MS);
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });

  let response: Response | null;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch(() => null);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }

  if (controller.signal.aborted) {
    if (timedOut) throw new AnalysisUnavailableError(TIMEOUT_MESSAGE);
    throw new AnalysisCancelledError();
  }

  if (!response) {
    throw new AnalysisUnavailableError(
      "분석 서비스에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요."
    );
  }

  if (!response.ok) {
    const message = await response
      .json()
      .then((data: { error?: string }) => data.error)
      .catch(() => null);
    throw new AnalysisUnavailableError(
      message ?? "분석 서비스에서 오류가 발생했습니다. 다시 시도해 주세요."
    );
  }

  return (await response.json()) as T;
}
