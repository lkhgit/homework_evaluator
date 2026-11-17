"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { readStored } from "@/lib/browserStore";
import ErrorBanner from "@/components/ErrorBanner";
import AppNav from "@/components/AppNav";
import AnalysisNotice from "@/components/AnalysisNotice";
import { teacherNotices } from "@/lib/teacherNotices";
import TeacherRevision from "@/components/TeacherRevision";
import TeacherHistory from "@/components/TeacherHistory";
import type { TeacherSnapshot } from "@/lib/teacherSnapshot";
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
} from "@/components/WorkflowScreens";
import {
  WorkflowProvider,
  type ConditionId,
  type WorkflowStage,
} from "@/components/WorkflowContext";
import { runEngine } from "@/lib/engine";
import { shortCitation } from "@/lib/standards";
import {
  AnalysisUnavailableError,
  analyzeAssignment,
  classifyRepair,
  extractObjectives,
} from "@/lib/analysisSource";
import { buildStudentHandout, downloadHtml, handoutFilename } from "@/lib/studentHandout";
import { applyRepairs } from "@/lib/repairs";
import type { Analysis, FrictionMoment, RevisedAssignment, Step } from "@/lib/schema";
import { BIOLOGY_SAMPLE } from "@/samples/biology";
import type { StudentAnalysis } from "@/lib/studentAnalysis";

function describeError(error: unknown): string {
  if (error instanceof AnalysisUnavailableError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "이 과제를 분석하는 중 문제가 발생했습니다. 다시 시도해주세요.";
}

const STATUS_LABEL: Record<WorkflowStage, string> = {
  intro: "Homework evaluator 소개",
  analyze: "새 분석",
  loading: "과제 분석 중",
  goal: "학습 목표 확인",
  journey: "과제 분석 완료",
  barrier: "어려움 확인 중",
  repair: "개선안 검토 중",
  constraint: "접근성 조건 테스트 중",
  preview: "과제 개선안 미리보기",
  complete: "분석 완료",
};

export default function Home() {
  const [projectId, setProjectId] = useState("first-project");
  const [stage, setStage] = useState<WorkflowStage>("analyze");
  const [assignmentDraft, setAssignmentDraft] = useState("");
  const [analyzedDraft, setAnalyzedDraft] = useState("");
  const [analyzedText, setAnalyzedText] = useState("");
  const [objective, setObjective] = useState(BIOLOGY_SAMPLE.objectives[0].text);
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
  const [revised, setRevised] = useState<{ key: string; value: RevisedAssignment } | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<WorkflowStage>>(new Set(["analyze"]));
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("objective");
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [sourceConflicts, setSourceConflicts] = useState<StudentAnalysis["conflicts"]>([]);

  // Identifies the request currently in flight. A response that arrives after
  // the educator has started another analysis is discarded rather than allowed
  // to redirect them into results for text they have moved on from.
  const requestId = useRef(0);

  const analysis = useMemo(
    () => ({ ...baseAnalysis, steps }),
    [baseAnalysis, steps],
  );
  const report = useMemo(() => runEngine(analysis), [analysis]);

  // The same graph with accepted repairs applied. Everything downstream — the
  // score, the constraint tests — recomputes from this, so an applied repair
  // visibly removes the barrier instead of only being recorded.
  const repairApplication = useMemo(
    () => applyRepairs(analysis, appliedRepairIds),
    [analysis, appliedRepairIds],
  );
  const repairedAnalysis = repairApplication.analysis;
  const repairedReport = useMemo(
    () => runEngine(repairedAnalysis),
    [repairedAnalysis],
  );
  const selectedStep = useMemo(() => {
    if (!selectedFriction) return null;
    const matched = selectedFriction.stepIds
      .map((stepId) => steps.find((step) => step.id === stepId))
      .filter((step): step is Step => Boolean(step));
    return matched.find((step) => step.repair !== null) ?? matched[0] ?? null;
  }, [selectedFriction, steps]);

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
  const currentRevision = revised?.key === revisionKey ? revised.value : null;
  const activeRevisionKey = useRef(revisionKey);
  useEffect(() => { activeRevisionKey.current = revisionKey; }, [revisionKey]);
  // The student handout is drawn from the repaired steps, so its tree and its
  // excerpts describe the assignment the educator is now setting.
  const handoutHtml = useMemo(
    () =>
      currentRevision
        ? buildStudentHandout({
            revised: currentRevision,
            objective,
            originalSteps: steps,
            repairedSteps: repairedAnalysis.steps,
            appliedRepairIds,
          })
        : null,
    [currentRevision, objective, steps, repairedAnalysis.steps, appliedRepairIds],
  );

  useEffect(() => {
    if (stage === "intro") return;
    const timer = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(timer);
  }, [stage]);

  function addRepair(stepId: string) {
    setAppliedRepairIds((current) => current.includes(stepId) ? current : [...current, stepId]);
  }

  function keepCurrent(stepId: string) {
    setAppliedRepairIds((current) => current.filter((id) => id !== stepId));
  }

  async function customizeRepair(stepId: string, suggestion: string) {
    const token = requestId.current;
    const repair = await classifyRepair(objective, analysis, stepId, suggestion);
    if (token !== requestId.current) return;
    setSteps((current) =>
      current.map((step) => (step.id === stepId ? { ...step, repair } : step)),
    );
    addRepair(stepId);
  }

  const recordRevision = useCallback((key: string, value: RevisedAssignment) => {
    if (key !== activeRevisionKey.current) return;
    setRevised({ key, value });
  }, []);

  /** Single entry point for navigation so every arrival is recorded as visited. */
  const goToStage = useCallback((next: WorkflowStage) => {
    setStage(next);
    if (next !== "loading") {
      setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    }
  }, []);

  const navigateFromNav = useCallback((next: WorkflowStage) => {
    if (stage === "loading") requestId.current++;
    goToStage(next);
  }, [goToStage, stage]);

  /** Reads the assignment and proposes a learning objective for the educator to lock. */
  async function submitAssignment() {
    let text = assignmentDraft;
    const token = ++requestId.current;
    setError(null);
    setAppliedRepairIds([]);
    setRevised(null);
    setCondition("working_memory");
    setAnalysisWarnings([]);
    setSourceConflicts([]);
    // A new assignment invalidates every result downstream, so the stages that
    // showed them stop being reachable until this analysis produces its own.
    setVisited(new Set(["analyze"]));
    setLoadingPhase("objective");
    goToStage("loading");

    try {
      const files = await readStored<File[]>(`teacher-files:${projectId}`) ?? [];
      if (files.length) {
        const form = new FormData(); files.forEach(file => form.append("files", file));
        const response = await fetch("/api/extract", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "자료를 읽지 못했습니다.");
        text = [text, data.text].filter(Boolean).join("\n\n");
      }
      const objectives = await extractObjectives(text, files);
      if (token !== requestId.current) return;
      setAnalyzedText(text);
      setAnalyzedDraft(assignmentDraft);
      setObjective(objectives[0]?.text ?? "");
      goToStage("goal");
    } catch (err) {
      if (token !== requestId.current) return;
      setError(describeError(err));
      goToStage("analyze");
    }
  }

  /** Locks the objective, then analyses the task against it. */
  async function lockAndAnalyze(lockedObjective: string) {
    const token = ++requestId.current;
    setObjective(lockedObjective);
    setError(null);
    setLoadingPhase("analysis");
    goToStage("loading");

    try {
      const conflictCheck = async () => {
        const body = new FormData();
        body.append("text", analyzedText);
        const files = await readStored<File[]>(`teacher-files:${projectId}`) ?? [];
        files.forEach(file => body.append("files", file));
        const response = await fetch("/api/student", { method: "POST", body });
        if (!response.ok) throw new Error("자료 간 충돌을 확인하지 못했습니다. 원본을 직접 확인해 주세요.");
        return await response.json() as StudentAnalysis;
      };
      const files = await readStored<File[]>(`teacher-files:${projectId}`) ?? [];
      const [result, check] = await Promise.all([
        analyzeAssignment(analyzedText, lockedObjective, files),
        conflictCheck().then(value => ({ value }), () => ({ value: null })),
      ]);
      if (token !== requestId.current) return;
      setBaseAnalysis(result.analysis);
      setSteps(result.analysis.steps);
      setAnalysisWarnings(check.value ? [...result.warnings, ...check.value.warnings] : [...result.warnings, "자료 간 충돌을 확인하지 못했습니다. 원본을 직접 확인해 주세요."]);
      setSourceConflicts(check.value?.conflicts ?? []);
      setSelectedFriction(result.analysis.frictionMoments[0] ?? null);
      goToStage("journey");
    } catch (err) {
      if (token !== requestId.current) return;
      setError(describeError(err));
      goToStage("goal");
    }
  }

  function exportStudentHtml() {
    if (!currentRevision || !handoutHtml) return;
    downloadHtml(handoutFilename(currentRevision.title), handoutHtml);
  }

  const startOver = useCallback(() => {
    requestId.current++;
    setProjectId(crypto.randomUUID());
    setAssignmentDraft("");
    setAnalyzedText("");
    setAnalyzedDraft("");
    setObjective(BIOLOGY_SAMPLE.objectives[0].text);
    setBaseAnalysis(BIOLOGY_SAMPLE.analysis);
    setSteps(BIOLOGY_SAMPLE.analysis.steps);
    setAppliedRepairIds([]);
    setCondition("working_memory");
    setSelectedFriction(BIOLOGY_SAMPLE.analysis.frictionMoments[0] ?? null);
    setError(null);
    setRevised(null);
    setVisited(new Set(["analyze"]));
    setAnalysisWarnings([]);
    setSourceConflicts([]);
    goToStage("analyze");
  }, [goToStage]);

  const workflowActions = useMemo(() => ({
    goTo: goToStage,
    selectFriction: setSelectedFriction,
    selectCondition: setCondition,
    applyRepair: addRepair,
    startOver,
  }), [goToStage, startOver]);

  const goalPreserved = appliedRepairIds.every((stepId) => {
    const repair = steps.find((step) => step.id === stepId)?.repair;
    return repair?.rigorPreserved !== false;
  });

  const snapshot: TeacherSnapshot = { projectId, stage, assignmentDraft, analyzedText, analyzedDraft, objective, baseAnalysis, steps, appliedRepairIds, revised, visited: [...visited], selectedFriction, condition, analysisWarnings, sourceConflicts };
  const history = <TeacherHistory snapshot={snapshot} onRestore={value => {
    requestId.current++;
    setProjectId(value.projectId); setStage(value.stage === "loading" ? "analyze" : value.stage);
    setAssignmentDraft(value.assignmentDraft); setAnalyzedText(value.analyzedText); setAnalyzedDraft(value.analyzedDraft ?? value.analyzedText); setObjective(value.objective);
    setBaseAnalysis(value.baseAnalysis); setSteps(value.steps); setAppliedRepairIds(value.appliedRepairIds);
    setRevised(value.revised); setVisited(new Set(value.visited)); setSelectedFriction(value.selectedFriction);
    setCondition(value.condition); setAnalysisWarnings(value.analysisWarnings); setSourceConflicts(value.sourceConflicts); setError(null);
  }} />;

  return (
    <WorkflowProvider value={workflowActions}>
      <div className="app-shell">
        <AppNav stage={stage} visited={visited} onNavigate={navigateFromNav} />
        {stage === "intro" && <IntroScreen onEnter={() => goToStage("analyze")} />}
        <p className="sr-only" aria-live="polite">{STATUS_LABEL[stage]}</p>

        {error && (
          <ErrorBanner message={error} />
        )}
        <AnalysisNotice key={JSON.stringify([projectId, analysisWarnings, sourceConflicts])} messages={teacherNotices(analysisWarnings, sourceConflicts)} />

        <div className="screen-enter" key={stage}>
          {stage === "analyze" && (
            <AnalyzeScreen
              projectId={projectId}
              text={assignmentDraft}
              onChange={setAssignmentDraft}
              onSubmit={submitAssignment}
              hasAnalysis={visited.has("journey")}
            />
          )}
          {stage === "loading" && <AnalysisLoadingScreen phase={loadingPhase} onCancel={() => navigateFromNav(loadingPhase === "analysis" ? "goal" : "analyze")} />}
          {stage === "goal" && <GoalLockScreen objective={objective} onEdit={setObjective} onLock={() => lockAndAnalyze(objective)} />}
          {stage === "journey" && (
            <>
              <JourneyScan analysis={analysis} report={report} />
              <TeacherRevision text={analyzedText} objective={objective} onReplace={(next) => {
                requestId.current++;
                setAssignmentDraft(next);
                setAppliedRepairIds([]);
                setRevised(null);
                setAnalysisWarnings([]);
                setSourceConflicts([]);
                setVisited(new Set(["analyze"]));
                goToStage("analyze");
              }} />
              <section className="journey-bottom">
                {analysis.frictionMoments.length > 0 ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => { setSelectedFriction(analysis.frictionMoments[0]); goToStage("barrier"); }}
                  >
                    어려움 확인하기 <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ) : (
                  // Nothing to trace and nothing to repair. Skipping straight to
                  // the constraint tests keeps the two screens that would
                  // otherwise have to invent something to show out of the way.
                  <div className="journey-clear">
                    <p>
                      <CheckCircle2 size={17} aria-hidden="true" />
                      예상되는 어려움이 없습니다. 접근 조건도 확인해 보세요.
                    </p>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => goToStage("constraint")}
                    >
                      접근 조건 확인하기 <ArrowRight size={17} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {stage === "barrier" && selectedFriction && selectedStep && (
            <BarrierTrace
              assignmentText={analyzedText}
              step={selectedStep}
              friction={selectedFriction}
              citation={shortCitation(selectedFriction.barrierType)}
            />
          )}
          {stage === "repair" && <RepairScreen steps={steps} appliedRepairIds={appliedRepairIds} onApply={addRepair} onKeep={keepCurrent} onCustomize={customizeRepair} />}
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
              onRevised={recordRevision}
              handoutHtml={handoutHtml}
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
              repairsApplied={appliedRepairIds.length}
              goalPreserved={goalPreserved}
              canExport={currentRevision !== null}
              onExport={exportStudentHtml}
            />
          )}
        </div>
        {history}
      </div>
    </WorkflowProvider>
  );
}
