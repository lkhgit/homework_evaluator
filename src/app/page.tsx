"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import AccessibilityScore from "@/components/AccessibilityScore";
import AppNav from "@/components/AppNav";
import FirstRunGuide from "@/components/FirstRunGuide";
import GoalBox from "@/components/GoalBox";
import IntroScreen from "@/components/IntroScreen";
import {
  AnalyzeScreen,
  AnalysisLoadingScreen,
  BarrierTrace,
  CompleteScreen,
  ConstraintTest,
  GoalLockScreen,
  JourneyScan,
  RepairScreen,
  StudentPreview,
  type LoadingPhase,
  type RepairsView,
} from "@/components/WorkflowScreens";
import {
  WorkflowProvider,
  type ConditionId,
  type WorkflowStage,
} from "@/components/WorkflowContext";
import { runEngine, scoreAccessibility } from "@/lib/engine";
import {
  GUIDE_DISMISSED_KEY,
  clearSnapshot,
  readSnapshot,
  resumableStage,
  savedAtLabel,
  writeSnapshot,
  type WorkflowSnapshot,
} from "@/lib/autosave";
import { STANDARDS, shortCitation } from "@/lib/standards";
import {
  AnalysisCancelledError,
  AnalysisUnavailableError,
  analyzeAssignment,
  isSampleRequest,
  type AnalysisResult,
  classifyRepair,
  extractObjectives,
  fetchRepairs,
  type RepairsResult,
  generatePreview,
  type AcceptedRepair,
} from "@/lib/analysisSource";
import {
  buildSummary,
  downloadSummary,
  summaryFilename,
  type SummaryDeliverable,
} from "@/lib/exportSummary";
import { createPreviewRequests } from "@/lib/previewRequests";
import { buildStudentHandout as buildStudentGuideHtml, guideFilename } from "@/lib/studentGuideExport";
import { applyRepairs } from "@/lib/repairs";
import type { Analysis, FrictionMoment, ObjectiveCandidate, RevisedAssignment, Step } from "@/lib/schema";
import {
  analysisKey,
  assignmentKey,
  canAcceptRepair,
  lockDecision,
  mergeRepairs,
  repairsStatusFor,
  type RepairsStatus,
  deliverableFor,
  objectiveChanged,
  resolveCustomRepair,
  stepForFriction,
  titleOf,
  withRepair,
} from "@/lib/workflowState";
import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";

/**
 * Anti-flicker only: a loading screen that appears and vanishes in a few
 * milliseconds reads as a glitch. It does not pretend work is happening.
 */
const MIN_LOADING_MS = 300;

const minimumLoading = () => new Promise((resolve) => setTimeout(resolve, MIN_LOADING_MS));

function describeError(error: unknown): string {
  if (error instanceof AnalysisUnavailableError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "과제를 분석하지 못했습니다. 다시 시도해 주세요.";
}

const STATUS_LABEL: Record<WorkflowStage, string> = {
  intro: "AccessLens 소개",
  analyze: "새 분석",
  loading: "과제 분석 중",
  goal: "학습 목표 확인",
  journey: "활동 분석 완료",
  barrier: "문제 지점 검토 중",
  repair: "개선안 검토 중",
  constraint: "검증 중",
  preview: "학생용 미리보기",
  complete: "분석 완료",
};

export default function Home() {
  const [stage, setStage] = useState<WorkflowStage>("intro");
  const [assignmentDraft, setAssignmentDraft] = useState(BIOLOGY_TEXT);
  const [analyzedText, setAnalyzedText] = useState(BIOLOGY_TEXT);
  const [objective, setObjective] = useState(BIOLOGY_SAMPLE.analysisObjective);
  // The objective the current analysis was judged against. Goal relevance and
  // every repair depend on it, so results are only reachable while the
  // objective on screen still matches it.
  const [analyzedObjective, setAnalyzedObjective] = useState(BIOLOGY_SAMPLE.analysisObjective);
  const [baseAnalysis, setBaseAnalysis] = useState<Analysis>(BIOLOGY_SAMPLE.analysis);
  const [steps, setSteps] = useState<Step[]>(BIOLOGY_SAMPLE.analysis.steps);
  // Null whenever the analysis found nothing to review. An assignment with no
  // friction is a success, not an edge case, so it must not be papered over
  // with a fixture that belongs to a different assignment.
  const [selectedFriction, setSelectedFriction] = useState<FrictionMoment | null>(
    BIOLOGY_SAMPLE.analysis.frictionMoments[0] ?? null,
  );
  const [condition, setCondition] = useState<ConditionId>("working_memory");
  const [appliedRepairIds, setAppliedRepairIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Rewrites by revision key. Each is valid only for the exact inputs in its
  // key, so an older request finishing late can never replace a newer one.
  const [revisions, setRevisions] = useState<Readonly<Record<string, RevisedAssignment>>>({});
  const [previewFailure, setPreviewFailure] = useState<{ key: string; message: string } | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<WorkflowStage>>(new Set(["analyze"]));
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("objective");
  // True while the bundled sample is being served, so the loading screen can
  // say so instead of implying a model is working.
  const [loadingSample, setLoadingSample] = useState(false);
  // The memo key of the analysis currently on screen.
  const [currentAnalysisKey, setCurrentAnalysisKey] = useState(() =>
    analysisKey(BIOLOGY_TEXT, BIOLOGY_SAMPLE.analysisObjective),
  );
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  // A workflow saved in this browser, offered on the cover page until resumed or discarded.
  const [resumeSnapshot, setResumeSnapshot] = useState<WorkflowSnapshot | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  // Identifies the request currently in flight. A response that arrives after
  // the educator has started another analysis is discarded rather than allowed
  // to redirect them into results for text they have moved on from.
  const requestId = useRef(0);
  // Cancels the request behind the loading screen.
  const loadingAbort = useRef<AbortController | null>(null);
  // Session-only memo of model answers. Revisiting a step with unchanged
  // inputs costs no model call, no rate-limit budget and no decisions.
  const objectiveMemo = useRef(new Map<string, ObjectiveCandidate[]>());
  const analysisMemo = useRef(new Map<string, AnalysisResult>());
  const repairsMemo = useRef(new Map<string, RepairsResult>());
  const repairsAbort = useRef<AbortController | null>(null);
  // Repairs arrive after the graph. Their status is keyed by analysis, so a
  // reply for an analysis no longer on screen can never attach to this one.
  const [repairsStatus, setRepairsStatus] = useState<RepairsStatus | null>(() => ({
    key: analysisKey(BIOLOGY_TEXT, BIOLOGY_SAMPLE.analysisObjective),
    state: "ready",
  }));
  const currentKeyRef = useRef(analysisKey(BIOLOGY_TEXT, BIOLOGY_SAMPLE.analysisObjective));
  // The memo's keys as state, so rendering can tell whether a result exists.
  const [rememberedKeys, setRememberedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const analysis = useMemo(
    () => ({ ...baseAnalysis, steps }),
    [baseAnalysis, steps],
  );
  const report = useMemo(() => runEngine(analysis), [analysis]);
  const confidence = useMemo(() => scoreAccessibility(report, analysis), [report, analysis]);

  // The same graph with accepted repairs applied. Everything downstream — the
  // score, the constraint tests — recomputes from this, so an applied repair
  // visibly removes the barrier instead of only being recorded.
  const repairApplication = useMemo(
    () => applyRepairs(analysis, appliedRepairIds),
    [analysis, appliedRepairIds],
  );
  const repairedAnalysis = repairApplication.analysis;
  const resolvedFrictionIds = useMemo(
    () =>
      new Set(
        repairApplication.frictionResolutions
          .filter((resolution) => resolution.status === "resolved")
          .map((resolution) => resolution.frictionId),
      ),
    [repairApplication.frictionResolutions],
  );
  const repairedReport = useMemo(
    () => runEngine(repairedAnalysis),
    [repairedAnalysis],
  );
  const repairedConfidence = useMemo(
    () => scoreAccessibility(repairedReport, repairedAnalysis, resolvedFrictionIds),
    [repairedReport, repairedAnalysis, resolvedFrictionIds],
  );

  // Only a repair that acts on this finding's barrier is offered beside it.
  const selectedTrace = useMemo(
    () => (selectedFriction ? stepForFriction(analysis, selectedFriction) : null),
    [selectedFriction, analysis],
  );

  // The revision is only valid for the inputs it was generated from. Keying it
  // this way means changing a repair decision retires the old rewrite instead
  // of leaving it to be exported beside a repair count it no longer matches.
  const revisionKey = useMemo(
    () =>
      JSON.stringify([
        analyzedText,
        objective,
        steps
          .filter((step) => appliedRepairIds.includes(step.id) && step.repair !== null)
          .map((step) => ({ id: step.id, action: step.action, repair: step.repair }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ]),
    [analyzedText, objective, appliedRepairIds, steps],
  );
  const currentRevision = revisions[revisionKey] ?? null;
  // The step-by-step guide (prerequisite tree and per-step excerpts) is built
  // from the AI rewrite and the repaired steps, so it exists only beside a rewrite.
  const guide = useMemo(() => {
    const revision = revisions[revisionKey];
    if (!revision || repairApplication.appliedRepairIds.length === 0) return null;
    return {
      html: buildStudentGuideHtml({
        revised: revision,
        objective,
        originalSteps: steps,
        repairedSteps: repairedAnalysis.steps,
        appliedRepairIds: repairApplication.appliedRepairIds,
      }),
      filename: guideFilename(revision.title),
    };
  }, [revisions, revisionKey, objective, steps, repairedAnalysis.steps, repairApplication.appliedRepairIds]);

  useEffect(() => {
    if (stage === "intro") return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    // Read after hydration: localStorage does not exist on the server render.
    const timer = window.setTimeout(() => {
      setResumeSnapshot(readSnapshot());
      try {
        setGuideOpen(window.localStorage.getItem(GUIDE_DISMISSED_KEY) !== "1");
      } catch {
        setGuideOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function closeGuide() {
    setGuideOpen(false);
    try {
      window.localStorage.setItem(GUIDE_DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable: the guide simply shows again next visit.
    }
  }

  // Only a step that actually carries a proposal can be accepted. Recording an
  // id with nothing behind it counted as an applied repair everywhere.
  const addRepair = useCallback((stepId: string) => {
    if (!canAcceptRepair(steps, stepId)) return;
    setAppliedRepairIds((current) => current.includes(stepId) ? current : [...current, stepId]);
  }, [steps]);

  function keepCurrent(stepId: string) {
    setAppliedRepairIds((current) => current.filter((id) => id !== stepId));
  }

  async function customizeRepair(stepId: string, suggestion: string) {
    // Pinned to the analysis it was asked about. A reply that lands after a new
    // analysis or a fresh start belongs to a graph that no longer exists, and
    // step ids are reused across analyses, so it must not touch the new one.
    const requestToken = requestId.current;
    const target = steps.find((step) => step.id === stepId);
    if (!target) throw new Error("이 활동을 더 이상 찾을 수 없습니다.");
    const response = await classifyRepair(objective, analysis, target.id, suggestion);
    const outcome = resolveCustomRepair({
      requestToken,
      currentToken: requestId.current,
      steps,
      stepId,
      response,
    });
    if (outcome.status === "stale") return;
    if (outcome.status === "invalid") {
      throw new Error("개선안 분류 결과가 올바르지 않습니다. 다시 시도해 주세요.");
    }
    if (outcome.status === "missing-step") {
      throw new Error("이 활동을 더 이상 찾을 수 없습니다.");
    }
    // Merged into the steps as they are now, so another proposal edited while
    // this one was in flight is not overwritten.
    setSteps((current) => withRepair(current, stepId, outcome.repair));
    setAppliedRepairIds((current) => current.includes(stepId) ? current : [...current, stepId]);
  }

  /** Editing the objective after an analysis retires everything judged against the old one. */
  function editObjective(next: string) {
    setObjective(next);
    if (objectiveChanged(next, analyzedObjective)) {
      // Also retires any custom-repair reply still in flight for the old goal.
      requestId.current++;
      invalidateResults();
    }
  }

  function invalidateResults() {
    setAppliedRepairIds([]);
    setPreviewFailure(null);
    setVisited(new Set<WorkflowStage>(["analyze", "goal"]));
  }

  // Rewrite requests live here, above the screens, so leaving the preview
  // mid-request keeps the paid result and returning reuses the request.
  const previewInputs = useRef(new Map<string, { text: string; objective: string; repairs: AcceptedRepair[]; steps: Array<{ id: string; action: string }> }>());
  const [previewRequests] = useState(() =>
    createPreviewRequests<RevisedAssignment>(
      (key) => {
        const input = previewInputs.current.get(key);
        if (!input) return Promise.reject(new Error("AI 수정본을 만들 원본을 찾을 수 없습니다."));
        return generatePreview(input.text, input.objective, input.repairs, { steps: input.steps });
      },
      {
        onResult: (key, value) => setRevisions((current) => ({ ...current, [key]: value })),
        onError: (key, error) =>
          setPreviewFailure({
            key,
            message: error instanceof Error ? error.message : "AI 수정본을 만들지 못했습니다.",
          }),
      },
    ),
  );

  const acceptedForPreview = useMemo(
    () =>
      steps
        .filter((step) => appliedRepairIds.includes(step.id) && step.repair)
        .map((step) => ({
          action: step.action,
          suggestion: step.repair!.suggestion,
          rigorNote: step.repair!.rigorNote,
        })),
    [steps, appliedRepairIds],
  );

  const requestPreview = useCallback(() => {
    if (acceptedForPreview.length === 0 || revisions[revisionKey]) return;
    previewInputs.current.set(revisionKey, {
      text: analyzedText,
      objective,
      repairs: acceptedForPreview,
      steps: steps.map((step) => ({ id: step.id, action: step.action })),
    });
    setPreviewFailure((current) => (current?.key === revisionKey ? null : current));
    void previewRequests.ensure(revisionKey).catch(() => undefined);
  }, [acceptedForPreview, revisions, revisionKey, analyzedText, objective, previewRequests, steps]);

  /** Single entry point for navigation so every arrival is recorded as visited. */
  const goToStage = useCallback((next: WorkflowStage) => {
    setStage(next);
    if (next !== "loading") {
      setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    }
  }, []);

  const navigateFromNav = useCallback((next: WorkflowStage) => {
    if (stage === "loading") {
      requestId.current++;
      loadingAbort.current?.abort();
    }
    goToStage(next);
  }, [goToStage, stage]);

  function beginLoading(phase: LoadingPhase, sample: boolean): AbortController {
    loadingAbort.current?.abort();
    const controller = new AbortController();
    loadingAbort.current = controller;
    setLoadingPhase(phase);
    setLoadingSample(sample);
    goToStage("loading");
    return controller;
  }

  /** The loading screen's cancel: abort the request and go back with drafts intact. */
  function cancelLoading() {
    requestId.current++;
    loadingAbort.current?.abort();
    loadingAbort.current = null;
    goToStage(loadingPhase === "analysis" ? "goal" : "analyze");
  }

  /** Reads the assignment and proposes a learning objective for the educator to lock. */
  async function submitAssignment() {
    const text = assignmentDraft;
    const token = ++requestId.current;
    setError(null);
    const remembered = objectiveMemo.current.get(assignmentKey(text));

    // The same text again (back from a later step, no edits): keep the results
    // and decisions and return to the goal with the objective already chosen.
    if (remembered && assignmentKey(text) === assignmentKey(analyzedText)) {
      goToStage("goal");
      return;
    }

    setAppliedRepairIds([]);
    setPreviewFailure(null);
    setCondition("working_memory");
    setAnalysisWarnings([]);
    // A new assignment invalidates every result downstream, so the stages that
    // showed them stop being reachable until this analysis produces its own.
    setVisited(new Set(["analyze"]));

    if (remembered) {
      setAnalyzedText(text);
      setObjective(remembered[0]?.text ?? "");
      goToStage("goal");
      return;
    }

    const controller = beginLoading("objective", isSampleRequest(text, BIOLOGY_SAMPLE.analysisObjective));
    try {
      const [objectives] = await Promise.all([
        extractObjectives(text, { signal: controller.signal }),
        minimumLoading(),
      ]);
      if (token !== requestId.current) return;
      objectiveMemo.current.set(assignmentKey(text), objectives);
      setAnalyzedText(text);
      setObjective(objectives[0]?.text ?? "");
      goToStage("goal");
    } catch (err) {
      if (token !== requestId.current || err instanceof AnalysisCancelledError) return;
      setError(describeError(err));
      goToStage("analyze");
    }
  }

  function applyRepairsResult(key: string, result: RepairsResult) {
    if (currentKeyRef.current !== key) return;
    setSteps((current) => mergeRepairs(current, result.repairs));
    if (result.warnings.length > 0) {
      setAnalysisWarnings((current) => [...current, ...result.warnings.filter((warning) => !current.includes(warning))]);
    }
    setRepairsStatus({ key, state: "ready" });
  }

  /**
   * The second pass, in the background: the graph is already on screen.
   * Remembered proposals are reused; a reply for an analysis that is no
   * longer current is kept in the memo but never attached.
   */
  function loadRepairs(key: string, text: string, lockedObjective: string, graph: Analysis, force = false) {
    const remembered = force ? undefined : repairsMemo.current.get(key);
    if (remembered) {
      applyRepairsResult(key, remembered);
      return;
    }
    repairsAbort.current?.abort();
    const controller = new AbortController();
    repairsAbort.current = controller;
    setRepairsStatus({ key, state: "loading" });
    fetchRepairs(text, lockedObjective, graph, { signal: controller.signal })
      .then((result) => {
        repairsMemo.current.set(key, result);
        applyRepairsResult(key, result);
      })
      .catch((err: unknown) => {
        if (err instanceof AnalysisCancelledError || currentKeyRef.current !== key) return;
        setRepairsStatus({ key, state: "failed", message: describeError(err) });
      });
  }

  function retryRepairs() {
    loadRepairs(currentAnalysisKey, analyzedText, analyzedObjective, analysis, true);
  }

  function showAnalysis(key: string, lockedObjective: string, result: AnalysisResult) {
    // A new graph replaces the old one, and step ids repeat between analyses,
    // so decisions made on the old graph must not attach to the new one.
    invalidateResults();
    currentKeyRef.current = key;
    setCurrentAnalysisKey(key);
    setBaseAnalysis(result.analysis);
    setAnalyzedObjective(lockedObjective);
    setSteps(result.analysis.steps);
    setAnalysisWarnings(result.warnings);
    setSelectedFriction(result.analysis.frictionMoments[0] ?? null);
    goToStage("journey");
    loadRepairs(key, analyzedText, lockedObjective, result.analysis);
  }

  /**
   * Locks the objective, then analyses the task against it. Unchanged text and
   * objective go straight back to the results already on screen, decisions
   * intact; a remembered answer is reused; only `force` (다시 분석) always asks
   * the model again.
   */
  async function lockAndAnalyze(lockedObjective: string, options: { force?: boolean } = {}) {
    const key = analysisKey(analyzedText, lockedObjective);
    setObjective(lockedObjective);
    setError(null);

    const remembered = analysisMemo.current.get(key);
    const decision = lockDecision({
      key,
      currentKey: currentAnalysisKey,
      objectiveChangedSinceAnalysis: objectiveChanged(lockedObjective, analyzedObjective),
      remembered: remembered !== undefined,
      force: options.force === true,
    });
    if (decision === "show-current") {
      requestId.current++;
      goToStage("journey");
      // Results kept; only fetch repairs if they never arrived for this graph.
      if (repairsStatusFor(repairsStatus, key) !== "ready") loadRepairs(key, analyzedText, lockedObjective, analysis);
      return;
    }
    if (decision === "use-remembered" && remembered) {
      requestId.current++;
      showAnalysis(key, lockedObjective, remembered);
      return;
    }

    const token = ++requestId.current;
    const controller = beginLoading("analysis", isSampleRequest(analyzedText, lockedObjective));
    try {
      const [result] = await Promise.all([
        analyzeAssignment(analyzedText, lockedObjective, { signal: controller.signal }),
        minimumLoading(),
      ]);
      if (token !== requestId.current) return;
      analysisMemo.current.set(key, result);
      setRememberedKeys((current) => new Set(current).add(key));
      showAnalysis(key, lockedObjective, result);
    } catch (err) {
      if (token !== requestId.current || err instanceof AnalysisCancelledError) return;
      setError(describeError(err));
      goToStage("goal");
    }
  }

  const repairsState = repairsStatusFor(repairsStatus, currentAnalysisKey);
  const repairsView: RepairsView = {
    state: repairsState,
    message: repairsStatus?.key === currentAnalysisKey && repairsStatus.state === "failed" ? repairsStatus.message : "",
    onRetry: retryRepairs,
  };

  // With nothing accepted there is nothing to rewrite: the deliverable is the
  // original, unchanged, and no model call is needed to produce it.
  const acceptedRepairCount = repairApplication.appliedRepairIds.length;
  const deliverable = useMemo(
    () =>
      deliverableFor({
        originalText: analyzedText,
        objective,
        acceptedSteps: steps.filter((step) => repairApplication.appliedRepairIds.includes(step.id)),
        revision: currentRevision,
        timeConstraints: analysis.timeConstraints,
      }),
    [analyzedText, objective, steps, repairApplication.appliedRepairIds, currentRevision, analysis.timeConstraints],
  );
  const exportable: SummaryDeliverable | null = !deliverable
    ? null
    : deliverable.kind === "original"
      ? { kind: "original", title: deliverable.title, text: deliverable.body }
      : currentRevision
        ? { kind: "revised", revision: currentRevision }
        : null;

  function exportSummary() {
    if (!exportable) return;
    const title = exportable.kind === "revised" ? exportable.revision.title : exportable.title;
    downloadSummary(
      summaryFilename(title),
      // Measured against the repaired graph, matching the revised assignment
      // the file carries and the after-score shown on the completion screen.
      buildSummary(exportable, objective, {
        analysis,
        report,
        scoreBefore: confidence.score,
        repairedAnalysis,
        repairedReport,
        scoreAfter: repairedConfidence.score,
        frictionResolutions: repairApplication.frictionResolutions,
        revisionCheck: deliverable?.check ?? null,
      })
    );
  }

  const startOver = useCallback(() => {
    requestId.current++;
    loadingAbort.current?.abort();
    repairsAbort.current?.abort();
    const sampleKey = analysisKey(BIOLOGY_TEXT, BIOLOGY_SAMPLE.analysisObjective);
    currentKeyRef.current = sampleKey;
    setCurrentAnalysisKey(sampleKey);
    // The bundled sample on the start screen already carries its repairs.
    setRepairsStatus({ key: sampleKey, state: "ready" });
    setAssignmentDraft(BIOLOGY_TEXT);
    setAnalyzedText(BIOLOGY_TEXT);
    setObjective(BIOLOGY_SAMPLE.analysisObjective);
    setAnalyzedObjective(BIOLOGY_SAMPLE.analysisObjective);
    setBaseAnalysis(BIOLOGY_SAMPLE.analysis);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0] ?? null);
    setError(null);
    setPreviewFailure(null);
    setVisited(new Set(["analyze"]));
    setAnalysisWarnings([]);
    goToStage("analyze");
  }, [goToStage]);

  const proposalCount = steps.filter((step) => step.repair !== null).length;
  // The goal box appears once the goal is locked and a graph exists for it.
  const showSummary = ["journey", "barrier", "repair", "constraint", "preview"].includes(stage);
  const summary = showSummary ? (
    <GoalBox
      title={titleOf(analyzedText)}
      objective={analyzedObjective}
      scoreBefore={confidence.score}
      scoreAfter={repairedConfidence.score}
      accepted={repairApplication.appliedRepairIds.length}
      proposals={proposalCount}
    />
  ) : null;

  // The textbook's side margin: what this page is for, and how to read its numbers.
  const incidentalSteps = analysis.steps.filter((step) => step.goalRelevance === "incidental").length;
  const essentialRisks = analysis.steps.filter((step) => step.goalRelevance === "essential" && step.repair).length;
  const wing: Partial<Record<WorkflowStage, ReactNode>> = {
    goal: (
      <>
        <section>
          <h2>이 화면은</h2>
          <p>학생이 과제를 마치고 배워야 할 것을 한 문장으로 확정합니다. 이후 관련성 판단과 개선안은 모두 이 문장이 기준입니다.</p>
        </section>
        <section>
          <h2>목표를 바꾸면</h2>
          <p>이전 결과를 숨기고 바뀐 목표로 다시 분석합니다. 과제와 목표가 같으면 저장된 결과를 그대로 씁니다.</p>
        </section>
      </>
    ),
    journey: (
      <>
        <section>
          <h2>과제 요약</h2>
          <dl className="wing-facts">
            <div><dt>문제 지점</dt><dd>{analysis.frictionMoments.length}</dd></div>
            <div><dt>목표와 상관없는 활동</dt><dd>{incidentalSteps}</dd></div>
            <div><dt>개선이 필요한 필수 활동</dt><dd>{essentialRisks}</dd></div>
            <div><dt>사용하는 도구 수</dt><dd>{report.switching.uniqueEnvironments.length}</dd></div>
          </dl>
        </section>
        <AccessibilityScore {...confidence} />
      </>
    ),
    barrier: (
      <>
        <section>
          <h2>이 화면은</h2>
          <p>원본에서 문제를 일으키는 문장을 강조합니다. 왜 문제가 되는지, 어떤 기준에 근거하는지도 함께 보여 줍니다.</p>
        </section>
        <section>
          <h2>심각도 읽는 법</h2>
          <p>높음·보통·낮음은 AI가 매긴 값입니다. 교사가 원문과 함께 확인해야 합니다.</p>
        </section>
      </>
    ),
    repair: (
      <>
        <section>
          <h2>판정 읽는 법</h2>
          <p>&lsquo;난이도 유지됨&rsquo;은 AI 판단이며 검증된 사실이 아닙니다. 채택한 개선안만 점수와 수정본에 반영됩니다.</p>
        </section>
        <section>
          <h2>다음 단계</h2>
          <p>검증은 선택입니다. 바로 학생용 미리보기로 가도 됩니다.</p>
        </section>
      </>
    ),
  };
  const stageWing = wing[stage] ?? null;

  const workflowActions = {
    goTo: goToStage,
    selectFriction: setSelectedFriction,
    selectCondition: setCondition,
    applyRepair: addRepair,
    startOver,
    summary,
  };

  // Autosave: everything needed to land back on this screen with the same
  // decisions. Skipped on the cover and while a request is in flight.
  useEffect(() => {
    if (stage === "intro" || stage === "loading") return;
    const timer = window.setTimeout(() => {
      writeSnapshot({
        version: 1,
        savedAt: Date.now(),
        stage,
        assignmentDraft,
        analyzedText,
        objective,
        analyzedObjective,
        baseAnalysis,
        steps,
        appliedRepairIds,
        revisions,
        visited: [...visited],
        selectedFrictionId: selectedFriction?.id ?? null,
        condition,
        currentAnalysisKey,
        repairsReady: repairsStatusFor(repairsStatus, currentAnalysisKey) === "ready",
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [stage, assignmentDraft, analyzedText, objective, analyzedObjective, baseAnalysis, steps, appliedRepairIds, revisions, visited, selectedFriction, condition, currentAnalysisKey, repairsStatus]);

  function resume(saved: WorkflowSnapshot) {
    const restored = { ...saved.baseAnalysis, steps: saved.steps };
    try {
      // A saved graph from an older build must not crash the screens.
      runEngine(restored);
    } catch {
      clearSnapshot();
      setResumeSnapshot(null);
      setError("저장된 작업을 열 수 없어 새로 시작합니다.");
      goToStage("analyze");
      return;
    }
    requestId.current++;
    currentKeyRef.current = saved.currentAnalysisKey;
    setCurrentAnalysisKey(saved.currentAnalysisKey);
    setRepairsStatus(
      saved.repairsReady
        ? { key: saved.currentAnalysisKey, state: "ready" }
        : { key: saved.currentAnalysisKey, state: "failed", message: "개선안을 받기 전에 저장된 작업입니다. 다시 불러오세요." },
    );
    setAssignmentDraft(saved.assignmentDraft);
    setAnalyzedText(saved.analyzedText);
    setObjective(saved.objective);
    setAnalyzedObjective(saved.analyzedObjective);
    setBaseAnalysis(saved.baseAnalysis);
    setSteps(saved.steps);
    setAppliedRepairIds(saved.appliedRepairIds.filter((id) => canAcceptRepair(saved.steps, id)));
    setRevisions(saved.revisions);
    setCondition(saved.condition);
    setSelectedFriction(
      saved.baseAnalysis.frictionMoments.find((friction) => friction.id === saved.selectedFrictionId) ??
        saved.baseAnalysis.frictionMoments[0] ??
        null,
    );
    setVisited(new Set(saved.visited.length > 0 ? saved.visited : ["analyze"]));
    setResumeSnapshot(null);
    goToStage(resumableStage(saved.stage));
  }

  function discardSaved() {
    clearSnapshot();
    setResumeSnapshot(null);
  }

  const goalPreserved = repairApplication.appliedRepairIds.every((stepId) => {
    const repair = steps.find((step) => step.id === stepId)?.repair;
    return repair?.rigorPreserved !== false;
  });

  if (stage === "intro") {
    return (
      <IntroScreen
        onEnter={() => { discardSaved(); goToStage("analyze"); }}
        resume={resumeSnapshot && {
          title: titleOf(resumeSnapshot.analyzedText),
          savedLabel: savedAtLabel(resumeSnapshot.savedAt),
          onResume: () => resume(resumeSnapshot),
        }}
      />
    );
  }

  return (
    <WorkflowProvider value={workflowActions}>
      <div className="app-shell">
        <AppNav
          stage={stage}
          visited={visited}
          onNavigate={navigateFromNav}
          helpOpen={guideOpen}
          onToggleHelp={() => (guideOpen ? closeGuide() : setGuideOpen(true))}
        />
        {guideOpen && <FirstRunGuide onClose={closeGuide} />}
        <p className="sr-only" aria-live="polite">{STATUS_LABEL[stage]}</p>

        {error && (
          <p role="alert" className="workflow-error">
            {error}
          </p>
        )}
        {analysisWarnings.length > 0 && (
          <aside className="workflow-warning" aria-label="분석 품질 경고">
            <strong>분석 결과 중 확인할 부분이 있습니다.</strong>
            <ul>{analysisWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </aside>
        )}

        <div className={stageWing ? "stage-layout has-wing" : "stage-layout"}>
        <div className="screen-enter" key={stage}>
          {stage === "analyze" && (
            <AnalyzeScreen
              text={assignmentDraft}
              onChange={setAssignmentDraft}
              onSubmit={submitAssignment}
              hasAnalysis={visited.has("journey")}
            />
          )}
          {stage === "loading" && <AnalysisLoadingScreen phase={loadingPhase} sample={loadingSample} onCancel={cancelLoading} />}
          {stage === "goal" && (
            <GoalLockScreen
              objective={objective}
              onEdit={editObjective}
              onLock={() => lockAndAnalyze(objective)}
              onReanalyze={() => lockAndAnalyze(objective, { force: true })}
              hasResult={
                analysisKey(analyzedText, objective) === currentAnalysisKey ||
                rememberedKeys.has(analysisKey(analyzedText, objective))
              }
            />
          )}
          {stage === "journey" && (
            <>
              <JourneyScan analysis={analysis} report={report} />
              <section className="journey-bottom">
                {analysis.frictionMoments.length > 0 ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => { setSelectedFriction(analysis.frictionMoments[0]); goToStage("barrier"); }}
                  >
                    문제 지점 검토하기 <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ) : (
                  // Nothing to trace and nothing to repair. Skipping straight to
                  // the constraint tests keeps the two screens that would
                  // otherwise have to invent something to show out of the way.
                  <div className="journey-clear">
                    <p>
                      <CheckCircle2 size={17} aria-hidden="true" />
                      찾은 문제 지점이 없습니다. 다만 점수 내역에는 따로 측정한 부담이 표시될 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => goToStage("constraint")}
                    >
                      검증하기 <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {stage === "barrier" && selectedFriction && selectedTrace && (
            <BarrierTrace
              assignmentText={analyzedText}
              step={selectedTrace.step}
              repairRelevant={selectedTrace.repairRelevant}
              friction={selectedFriction}
              citation={shortCitation(selectedFriction.barrierType)}
              citationNote={STANDARDS[selectedFriction.barrierType].exception}
              repairs={repairsView}
            />
          )}
          {stage === "repair" && <RepairScreen steps={steps} appliedRepairIds={appliedRepairIds} onApply={addRepair} onKeep={keepCurrent} onCustomize={customizeRepair} repairs={repairsView} />}
          {stage === "constraint" && <ConstraintTest
              key={condition}
              analysis={analysis}
              repairedAnalysis={repairedAnalysis}
              report={report}
              repairedReport={repairedReport}
              condition={condition}
            />}
          {stage === "preview" && (
            <StudentPreview
              objective={objective}
              steps={steps}
              appliedRepairIds={appliedRepairIds}
              assignmentText={analyzedText}
              revisionKey={revisionKey}
              existingRevision={currentRevision}
              guide={guide}
              previewFailure={previewFailure?.key === revisionKey ? previewFailure.message : ""}
              onRequestPreview={requestPreview}
              timeConstraints={analysis.timeConstraints}
            />
          )}
          {stage === "complete" && (
            <CompleteScreen
              frictionCount={analysis.frictionMoments.length}
              frictionResolved={
                repairApplication.frictionResolutions.filter(
                  (resolution) => resolution.status === "resolved",
                ).length
              }
              frictionUnverified={repairApplication.frictionResolutions.filter(
                (resolution) => resolution.status === "unverified",
              ).length}
              repairsApplied={acceptedRepairCount}
              goalPreserved={goalPreserved}
              scoreBefore={confidence.score}
              scoreAfter={repairedConfidence.score}
              exportKind={exportable?.kind ?? null}
              onExport={exportSummary}
              handout={deliverable?.handout ?? null}
              guide={guide}
              revisionCheck={deliverable?.check ?? null}
            />
          )}
        </div>
        {stageWing && <aside className="wing" aria-label="이 단계 안내">{stageWing}</aside>}
        </div>
      </div>
    </WorkflowProvider>
  );
}
