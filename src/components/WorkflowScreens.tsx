"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Keyboard,
  Link2,
  LoaderCircle,
  Mic,
  MousePointer2,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import ErrorBanner from "@/components/ErrorBanner";
import DemandChips, { chipsForDemands } from "@/components/DemandChips";
import JourneyDiagram from "@/components/JourneyDiagram";
import StudentFlow from "@/components/StudentFlow";
import { useWorkflow, type ConditionId } from "@/components/WorkflowContext";
import { generatePreview } from "@/lib/analysisSource";
import type { EngineReport } from "@/lib/engine";
import { locateEvidence } from "@/lib/evidenceGuard";
import { timeConstraintChangesOf } from "@/lib/schema";
import type { Analysis, FrictionMoment, GoalRelevance, RepairEffects, RevisedAssignment, Step } from "@/lib/schema";
import { diffWords, type DiffSegment } from "@/lib/textDiff";
import { readStored, writeStored } from "@/lib/browserStore";
import { BIOLOGY_TEXT } from "@/samples/biology";

function ScreenHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="screen-heading">
      <h1 data-screen-heading tabIndex={-1}>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function ArrowButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="button button--primary" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      <ArrowRight size={17} aria-hidden="true" />
    </button>
  );
}

export interface AnalyzeScreenProps {
  projectId?: string;
  text: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** True once an analysis exists, so re-running is a replacement, not a first run. */
  hasAnalysis?: boolean;
}

export function AnalyzeScreen({ text, onChange, onSubmit, hasAnalysis = false, projectId = "first-project" }: AnalyzeScreenProps) {
  const [fileNote, setFileNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [originals, setOriginals] = useState<File[]>([]);
  useEffect(() => {
    let active = true;
    readStored<File[]>(`teacher-files:${projectId}`).then(files => { if (active) setOriginals(files ?? []); }).catch(() => { if (active) setFileNote({ tone: "error", text: "원본 자료를 불러오지 못했습니다." }); });
    return () => { active = false; };
  }, [projectId]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    setReading(true);
    setFileNote(null);
    try {
      const all = [...originals, ...files];
      if (all.length > 8 || new Set(all.map(file => file.name)).size !== all.length || all.some(file => file.size > 8000000) || all.reduce((sum, file) => sum + file.size, 0) > 11500000) throw new Error("파일은 이름이 서로 다른 최대 8개, 파일당 8MB, 전체 약 11MB까지 추가할 수 있습니다.");
      const next = [...originals, ...files];
      await writeStored(`teacher-files:${projectId}`, next);
      setOriginals(next);

      setFileNote({ tone: "ok", text: `${files.length}개 파일을 추가했습니다. 분석할 때 그림과 도식을 함께 확인합니다.` });
    } catch (error) {
      setFileNote({
        tone: "error",
        text: error instanceof Error ? error.message : "이 파일을 읽을 수 없습니다.",
      });
    } finally {
      setReading(false);
    }
  }

  return (
    <main id="main-content" className="workflow-main">
      <ScreenHeading
        title={hasAnalysis ? "과제 내용 수정" : "과제 점검하기"}
        subtitle={
          hasAnalysis
            ? "내용을 고친 뒤 다시 분석하세요. 기존 결과는 상단 단계에서 확인할 수 있습니다."
            : "학생에게 줄 지침을 넣어 주세요. 학습 목표와 학생이 어려워할 부분을 확인합니다."
        }
      />

      <div className="analysis-grid">
        <section className="document-panel" aria-labelledby="assignment-input-heading">
          <div className="input-toolbar">
            <h2 id="assignment-input-heading">과제 지침</h2>
            <div>
              <button type="button" className="text-button" disabled={reading} onClick={async () => {
                if ((text.trim() || originals.length) && !window.confirm("현재 입력과 첨부 파일을 확산 실험 예시로 바꿀까요?")) return;
                try { await writeStored(`teacher-files:${projectId}`, []); setOriginals([]); onChange(BIOLOGY_TEXT); setFileNote(null); }
                catch { setFileNote({ tone: "error", text: "예시를 적용하지 못했습니다. 다시 시도해 주세요." }); }
              }}>예시 적용</button>
              <button type="button" className="button button--secondary" aria-busy={reading} onClick={() => fileInput.current?.click()} disabled={reading}>
                {reading ? <LoaderCircle className="loading-spinner" size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />} {reading ? "파일 읽는 중…" : "파일 추가"}
              </button>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf,image/png,image/jpeg"
            multiple
            hidden
            aria-label="PDF 또는 이미지 업로드"
            onChange={handleFile}
          />
          {fileNote?.tone === "error" ? <ErrorBanner message={fileNote.text} /> : fileNote && (
            <p
              className="file-note"
              role="status"
            >
              {fileNote.text}
            </p>
          )}
          <ul className="uploaded-files">{originals.map((file, index) => <li key={file.name}><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" className="text-button" aria-label={`${file.name} 삭제`} onClick={async () => {
            try { const next = originals.filter((_, at) => at !== index); await writeStored(`teacher-files:${projectId}`, next); setOriginals(next); setFileNote(null); }
            catch { setFileNote({ tone: "error", text: "파일을 삭제하지 못했습니다. 다시 시도해 주세요." }); }
          }}>삭제</button></li>)}</ul>
          <p className="field-help teacher-file-help">PDF, PNG, JPG 파일을 추가하고 필요한 설명을 아래에 적어 주세요. 파일만으로도 분석할 수 있습니다.</p>
          <label htmlFor="assignment-text" className="sr-only">과제 내용</label>
          <textarea
            id="assignment-text"
            value={text}
            disabled={reading}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            placeholder="추가 설명이나 과제 지시문을 입력하세요. 첨부 파일의 내용은 여기에 옮기지 않아도 됩니다."
            aria-describedby="prototype-note"
          />
          <p className="data-notice">분석할 때 첨부 파일과 입력한 글이 외부 AI로 전송됩니다. 이름과 학번 등 불필요한 개인정보는 지워 주세요. <Link href="/guide">자료 처리 안내</Link></p>
          <div className="document-footer">
            <p id="prototype-note">
              {hasAnalysis
                ? "다시 분석하면 현재 결과와 개선안이 대체됩니다."
                : "PDF, PNG, JPG 파일을 추가하거나 직접 입력하세요."}
            </p>
            <ArrowButton onClick={onSubmit} disabled={(!text.trim() && !originals.length) || reading}>
              {hasAnalysis ? "과제 다시 분석하기" : "과제 분석하기"}
            </ArrowButton>
          </div>
        </section>

        <aside className="tips-panel" aria-labelledby="tips-title">
          <h2 id="tips-title">입력할 내용</h2>
          <ul>
            <li><Check size={15} aria-hidden="true" /> 학생에게 줄 지시문 전체</li>
            <li><Check size={15} aria-hidden="true" /> 학습 목표와 평가 기준</li>
            <li><Check size={15} aria-hidden="true" /> 준비물과 제출 방법</li>
          </ul>
          <div className="tip-note">
            <p>어떤 부분을 확인하나요?</p>
            <span>지시 순서, 외워야 할 정보, 시간 제한, 도구 사용과 답변 방식을 살펴봅니다.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

const PHASE_COPY = {
  objective: { title: "학습 목표를 확인하고 있습니다", description: "과제 지침에서 학생이 배워야 할 내용을 찾고 있습니다." },
  analysis: { title: "과제를 분석하고 있습니다", description: "수행 순서와 예상되는 어려움을 확인하고 있습니다. 과제가 길면 시간이 더 걸립니다." },
} as const;

export type LoadingPhase = keyof typeof PHASE_COPY;

export function AnalysisLoadingScreen({ phase = "analysis", onCancel }: { phase?: LoadingPhase; onCancel: () => void }) {
  const { title, description } = PHASE_COPY[phase];
  return (
    <main id="main-content" className="loading-screen" aria-busy="true">
      <LoaderCircle className="loading-spinner" size={44} aria-hidden="true" />
      <h1 data-screen-heading tabIndex={-1}>{title}</h1>
      <p role="status">{description}</p>
      <button type="button" className="button button--secondary" onClick={onCancel}>취소하고 돌아가기</button>
    </main>
  );
}

export interface GoalLockScreenProps {
  objective: string;
  onEdit: (objective: string) => void;
  onLock: () => void;
}

export function GoalLockScreen({ objective, onEdit, onLock }: GoalLockScreenProps) {
  const { goTo } = useWorkflow();
  return (
    <main id="main-content" className="workflow-main goal-screen">
      <ScreenHeading title="학습 목표 확인" subtitle="과제에서 찾은 목표입니다. 학생이 배워야 할 내용과 다르면 직접 고쳐 주세요." />
      <section className="goal-panel" aria-labelledby="goal-label">
        <h2 id="goal-label">학습 목표</h2>
        <div className="goal-content">
          <label className="sr-only" htmlFor="learning-objective">학습 목표 수정</label>
          <textarea id="learning-objective" value={objective} onChange={(event) => onEdit(event.target.value)} />
        </div>
        <p className="field-help">이 목표를 기준으로 과제의 어려움과 개선안을 검토합니다.</p>
      </section>
      <div className="screen-footer-actions">
        <button type="button" className="button button--secondary" onClick={() => goTo("analyze")}><ArrowLeft size={16} aria-hidden="true" /> 과제 수정</button>
        <ArrowButton onClick={onLock} disabled={!objective.trim()}>이 목표로 분석하기</ArrowButton>
      </div>
    </main>
  );
}

const RELEVANCE_LABEL: Record<GoalRelevance, string> = {
  essential: "필수",
  related: "관련",
  incidental: "무관",
  unknown: "검토 필요",
};

const SEVERITY_LABEL = { high: "높음", medium: "보통", low: "낮음" } as const;

export interface JourneyScanProps { analysis: Analysis; report: EngineReport }

/**
 * Steps are written in the third person for the educator ("Reads the
 * instructions"). Nodes need a short imperative instead, so the verb is
 * converted rather than stripped — dropping it leaves fragments like
 * "the assignment instructions in Canvas".
 */
function toImperative(verb: string): string {
  if (/ies$/i.test(verb)) return verb.slice(0, -3) + "y"; // tries -> try
  if (/(ch|sh|ss|x|z)es$/i.test(verb)) return verb.slice(0, -2); // watches -> watch
  if (/[^s]s$/i.test(verb)) return verb.slice(0, -1); // observes -> observe
  return verb;
}

function imperativeAction(action: string): string {
  const words = action.trim().split(/\s+/);
  if (words.length === 0) return action;

  words[0] = toImperative(words[0]);
  // "Opens and reads the article" -> "Open and read the article"
  const andIndex = words.findIndex((word, i) => i > 0 && word.toLowerCase() === "and");
  if (andIndex > 0 && words[andIndex + 1]) {
    words[andIndex + 1] = toImperative(words[andIndex + 1]);
  }

  const label = words.join(" ").replace(/[,;:]$/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function nodeLabel(action: string): string {
  const words = imperativeAction(action).split(/\s+/);

  const clipped = words.length > 5;
  const kept = clipped ? words.slice(0, 5) : [...words];

  // Trailing prepositions and articles read badly before an ellipsis
  // ("Read the assignment instructions in…"), so drop them.
  const DANGLING = /^(in|into|on|at|to|from|with|and|the|a|an|of|for|by|as)$/i;
  while (clipped && kept.length > 2 && DANGLING.test(kept[kept.length - 1])) kept.pop();

  const label = kept.join(" ").replace(/[,;:]$/, "");
  return label + (clipped ? "…" : "");
}

export function JourneyScan({ analysis, report }: JourneyScanProps) {
  const { goTo, selectFriction } = useWorkflow();
  const [selectedStepId, setSelectedStepId] = useState(() => (
    analysis.steps.find((step) => analysis.frictionMoments.some((friction) => friction.stepIds.includes(step.id)))?.id
    ?? analysis.steps[0]?.id
    ?? ""
  ));
  const frictionByStep = useMemo(() => {
    const map = new Map<string, FrictionMoment[]>();
    analysis.frictionMoments.forEach((friction) => {
      friction.stepIds.forEach((stepId) => map.set(stepId, [...(map.get(stepId) ?? []), friction]));
    });
    return map;
  }, [analysis]);
  const incidental = analysis.steps.filter((step) => step.goalRelevance === "incidental").length;
  const essentialRisks = analysis.steps.filter((step) => step.goalRelevance === "essential" && step.repair).length;
  const selectedStepIndex = Math.max(0, analysis.steps.findIndex((step) => step.id === selectedStepId));
  const selectedStep = analysis.steps[selectedStepIndex];
  const selectedFrictions = selectedStep ? frictionByStep.get(selectedStep.id) ?? [] : [];

  function selectStep(index: number) {
    const nextStep = analysis.steps[index];
    if (!nextStep) return;

    setSelectedStepId(nextStep.id);
    window.requestAnimationFrame(() => {
      const heading = document.getElementById("selected-step-title");
      heading?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 580px)").matches) {
        heading?.scrollIntoView({ block: "start", behavior: "auto" });
      }
    });
  }

  function affectedStepNumbers(friction: FrictionMoment): string {
    return friction.stepIds
      .map((stepId) => analysis.steps.findIndex((step) => step.id === stepId) + 1)
      .filter((stepNumber) => stepNumber > 0)
      .join(", ");
  }

  return (
    <main id="main-content" className="workflow-main journey-screen">
      <ScreenHeading
        title="과제 분석 결과"
        subtitle="학생이 해야 할 일을 순서대로 나눴습니다. 각 단계에서 예상되는 어려움을 확인하세요."
      />
      <section className="journey-explorer" aria-labelledby="journey-overview-title">
        <header className="journey-toolbar">
          <div>
            <h2 id="journey-overview-title">과제 수행 순서</h2>
            <p>단계를 선택하면 필요한 도구와 예상되는 어려움을 확인할 수 있습니다.</p>
          </div>
          <nav className="journey-controls" aria-label="과제 단계 이동">
            <span aria-live="polite">{analysis.steps.length}단계 중 {selectedStepIndex + 1}단계</span>
            <button
              type="button"
              onClick={() => selectStep(selectedStepIndex - 1)}
              disabled={selectedStepIndex === 0}
              aria-label="이전 단계 보기"
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => selectStep(selectedStepIndex + 1)}
              disabled={selectedStepIndex === analysis.steps.length - 1}
              aria-label="다음 단계 보기"
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </nav>
        </header>

        <dl className="journey-summary" aria-label="과제 요약">
          <div><dt>어려움</dt><dd>{analysis.frictionMoments.length}</dd></div>
          <div><dt>목표와 무관한 부담</dt><dd>{incidental}</dd></div>
          <div><dt>위험이 있는 필수 부담</dt><dd>{essentialRisks}</dd></div>
          <div><dt>학습 환경 수</dt><dd>{report.switching.uniqueEnvironments.length}</dd></div>
        </dl>

        <StudentFlow steps={analysis.steps} selected={selectedStepIndex} onSelect={selectStep} submissionCheck={false} detailId="journey-step-detail" />

        {selectedStep && (
          <article className="journey-step-detail" id="journey-step-detail" aria-labelledby="selected-step-title">
            <div className="journey-step-context">
              <h2 id="selected-step-title" tabIndex={-1}>{selectedStepIndex + 1}. {imperativeAction(selectedStep.action)}</h2>
              <dl className="step-facts">
                <div><dt>사용 도구</dt><dd><Link2 size={14} aria-hidden="true" /> {selectedStep.environment}</dd></div>
                <div><dt>학습 목표와의 관계</dt><dd>{RELEVANCE_LABEL[selectedStep.goalRelevance]}</dd></div>
              </dl>
              <div className="journey-demand-block">
                <h3>기능적 부담</h3>
                <DemandChips demands={selectedStep.demands} />
              </div>
            </div>

            <div className="journey-friction-detail">
              {selectedFrictions.length > 0 ? (
                <>
                  <div className="journey-friction-list">
                    {selectedFrictions.map((friction) => (
                      <section key={friction.id} className="journey-friction-card" aria-labelledby={`friction-title-${friction.id}`}>
                        <div className="journey-friction-heading">
                          <span className={`severity-${friction.severity}`}><AlertTriangle size={14} aria-hidden="true" /> {SEVERITY_LABEL[friction.severity]}</span>
                          <span>{affectedStepNumbers(friction)}단계에 영향</span>
                        </div>
                        <h3 id={`friction-title-${friction.id}`}>{friction.title}</h3>
                        <p>{friction.explanation}</p>
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => { selectFriction(friction); goTo("barrier"); }}
                        >
                          어려움 확인하기 <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <div className="journey-no-friction">
                  <span><CheckCircle2 size={19} aria-hidden="true" /></span>
                  <div>
                    <h3>이 단계에는 어려움이 없습니다</h3>
                    <p>이 단계에서는 접근성 문제가 발견되지 않았습니다.</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        )}
        <details className="journey-map">
          <summary>도구 이동과 기억 부담 자세히 보기</summary>
        <div className="journey-scroll" tabIndex={0} role="region" aria-label={`전체 ${analysis.steps.length}개 과제 단계`}>
          <JourneyDiagram
            analysis={analysis}
            report={report}
            selectedStepId={selectedStep?.id}
            frictionByStep={frictionByStep}
            onSelect={selectStep}
            nodeLabel={(step) => nodeLabel(step.action)}
            relevanceLabel={RELEVANCE_LABEL}
            severityLabel={SEVERITY_LABEL}
          />
        </div>
        </details>
      </section>
    </main>
  );
}

export interface BarrierTraceProps {
  assignmentText: string;
  step: Step;
  friction: FrictionMoment;
  citation: string;
}

function HighlightedEvidence({ assignmentText, evidence }: { assignmentText: string; evidence: string }) {
  // The same whitespace-tolerant match the evidence guard uses to verify the
  // quote. An exact indexOf would fail on a quote that differs only in line
  // wrapping, so a verified quote could pass the check and still not highlight.
  const span = locateEvidence(assignmentText, evidence);
  if (!span) return <p className="assignment-copy">{assignmentText}</p>;
  return (
    <p className="assignment-copy">
      {assignmentText.slice(0, span.start)}
      <mark>{assignmentText.slice(span.start, span.end)}</mark>
      {assignmentText.slice(span.end)}
    </p>
  );
}

const BARRIER_CATEGORY_LABEL: Record<string, string> = {
  working_memory: "작업 기억",
  context_switching: "환경 전환",
  fine_motor: "소근육 정밀도",
  time_pressure: "시간 압박",
  reading_load: "읽기 부담",
  single_modality_communication: "단일 응답 방식",
  sensory_color_only: "색상 단독 단서",
  sensory_audio_only: "소리 단독 단서",
  navigation_ambiguity: "불명확한 탐색",
};

export function BarrierTrace({ assignmentText, step, friction, citation }: BarrierTraceProps) {
  const { goTo } = useWorkflow();
  const category = BARRIER_CATEGORY_LABEL[friction.barrierType] ?? friction.barrierType.replaceAll("_", " ");
  return (
    <main id="main-content" className="workflow-main">
      <ScreenHeading title="어려움 살펴보기" subtitle="학생이 어디에서 막히는지, 그리고 왜 막히는지 확인하세요." />
      <div className="barrier-grid">
        <section className="excerpt-panel" aria-labelledby="excerpt-title">
          <div className="document-masthead">
            <h2 id="excerpt-title">과제 원문</h2>
          </div>
          <HighlightedEvidence assignmentText={assignmentText} evidence={step.evidence} />
        </section>
        <article className="barrier-detail">
          <h2>{friction.title}</h2>
          <div className="barrier-meta">
            <span>{category}</span>
            <strong className={`severity-text severity-${friction.severity}`}>심각도 {SEVERITY_LABEL[friction.severity]}</strong>
          </div>
          <dl>
            <div><dt>발견된 이유</dt><dd>{friction.explanation}</dd></div>
            <div><dt>중요한 이유</dt><dd>{step.relevanceReason}</dd></div>
            <div><dt>목표와의 관련성</dt><dd className="goal-relevance-value">{RELEVANCE_LABEL[step.goalRelevance]}</dd></div>
            <div><dt>개선 제안</dt><dd>{step.repair?.suggestion ?? "과제 분석 화면에서 이 단계를 다시 검토해보세요."}</dd></div>
          </dl>
          <p className="citation"><BookOpen size={15} aria-hidden="true" /> {citation}</p>
          <div className="barrier-actions">
            <button type="button" className="button button--secondary" onClick={() => goTo("journey")}><ArrowLeft size={16} aria-hidden="true" /> 과제 분석으로 돌아가기</button>
            <ArrowButton onClick={() => goTo("repair")}>개선안 검토하기</ArrowButton>
          </div>
        </article>
      </div>
    </main>
  );
}

export interface RepairScreenProps {
  steps: Step[];
  /** Previously accepted decisions remain selected when returning to review. */
  appliedRepairIds: string[];
  onApply: (stepId: string) => void;
  onKeep: (stepId: string) => void;
  onCustomize: (stepId: string, suggestion: string) => Promise<void>;
}

function effectLabels(effects: RepairEffects): string[] {
  const labels: string[] = [];
  if (effects.keepsInfoVisible) labels.push("정보를 계속 화면에 표시");
  if (effects.reducesWorkingMemory) labels.push("기억 부담 감소");
  if (effects.reducesFineMotor) labels.push("소근육 정밀도 부담 감소");
  if (effects.reducesReadingLoad) labels.push("읽기 부담 감소");
  if (effects.addsNonColorCue) labels.push("색상 외 단서 추가");
  if (effects.addsCaptionOrTranscript) labels.push("자막 또는 스크립트 추가");
  if (effects.addsResponseAlternative) labels.push("응답 방식 선택지 추가");
  if (effects.replacementEnvironment) {
    labels.push(`${effects.replacementEnvironment}(으)로 단계 이동`);
  }
  for (const change of timeConstraintChangesOf(effects)) {
    labels.push(
      change.action === "remove"
        ? `타이머 ${change.constraintId} 제거`
        : `타이머 ${change.constraintId}를 ${change.limitMinutes}분으로 설정`,
    );
  }
  return labels.length > 0 ? labels : ["측정되는 변화 없음"];
}

export function RepairScreen({ steps, appliedRepairIds, onApply, onKeep, onCustomize }: RepairScreenProps) {
  const { goTo } = useWorkflow();
  const repairSteps = steps.filter((step) => step.repair !== null);
  const [decisions, setDecisions] = useState<Record<string, "apply" | "keep" | "custom">>(
    () => Object.fromEntries(appliedRepairIds.map((id) => [id, "apply" as const])),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  function choose(stepId: string, choice: "apply" | "keep") {
    setDecisions((current) => ({ ...current, [stepId]: choice }));
    if (choice === "apply") onApply(stepId);
    else onKeep(stepId);
  }

  function beginCustomize(step: Step) {
    setEditingId(step.id);
    setDraft(step.repair?.suggestion ?? "");
    setCustomError(null);
  }

  async function saveCustomize(stepId: string) {
    const suggestion = draft.trim();
    if (!suggestion) {
      setCustomError("저장하기 전에 개선안 전체 내용을 작성해주세요.");
      return;
    }
    setSavingId(stepId);
    setCustomError(null);
    try {
      await onCustomize(stepId, suggestion);
      setDecisions((current) => ({ ...current, [stepId]: "custom" }));
      setEditingId(null);
    } catch (error) {
      setCustomError(
        error instanceof Error ? error.message : "개선안을 검증할 수 없습니다. 다시 시도해주세요.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const reviewed = Object.keys(decisions).length;
  const ready = Object.values(decisions).filter((decision) => decision !== "keep").length;

  return (
    <main id="main-content" className="workflow-main repair-screen">
      <ScreenHeading title="개선안 검토" subtitle="제안을 읽고 적용 여부를 선택하세요. 필요한 부분은 직접 수정할 수 있습니다." />
      <div className="repair-list">
        {repairSteps.length === 0 && <p className="empty-state">검토할 개선안이 없습니다. 다음 단계에서 접근 조건을 확인하세요.</p>}
        {repairSteps.map((step, index) => {
          const decision = decisions[step.id];
          const demands = chipsForDemands(step.demands);
          const highDemand = Math.max(step.demands.workingMemory, step.demands.fineMotor, step.demands.timePressure) >= 3;
          return (
            <article key={step.id} className={`repair-row ${decision === "apply" || decision === "custom" ? "is-accepted" : ""}`}>
              <div className="repair-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="repair-body">
                <div className="repair-title-row">
                  <h2>{step.repair!.barrierReduced}</h2>
                  <span className={`severity-text severity-${highDemand ? "high" : "medium"}`}>{highDemand ? "높음" : "보통"}</span>
                </div>
                <div className="repair-comparison">
                  <div><p>현재</p><span>{step.evidence}</span></div>
                  <ArrowRight size={18} aria-hidden="true" />
                  <div><p>제안</p><span>{step.repair!.suggestion}</span></div>
                </div>
                <ul className="repair-effect-list" aria-label="측정된 효과">
                  {effectLabels(step.repair!.effects).map((effect) => <li key={effect}>{effect}</li>)}
                </ul>
                {editingId === step.id && (
                  <div className="customize-field">
                    <label htmlFor={`custom-${step.id}`}>제안 직접 수정하기</label>
                    <textarea id={`custom-${step.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
                    <p>새로 작성한 내용은 측정치에 반영되기 전에 다시 분류됩니다.</p>
                    {customError && <ErrorBanner message={customError} />}
                    <button type="button" className="button button--small button--primary" onClick={() => saveCustomize(step.id)} disabled={savingId === step.id || draft.trim().length === 0}>
                      {savingId === step.id ? "검증 중…" : "저장 및 적용"}
                    </button>
                  </div>
                )}
                <div className="rigor-note">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <p><strong>난이도 {step.repair!.rigorPreserved ? "유지됨" : "검토 필요"}</strong><span>{step.repair!.rigorNote}</span></p>
                </div>
                <div className="repair-row-actions" aria-label={`${step.repair!.barrierReduced}에 대한 결정`}>
                  <button type="button" className={decision === "apply" ? "is-selected" : ""} aria-pressed={decision === "apply"} onClick={() => choose(step.id, "apply")}><Check size={14} aria-hidden="true" /> 적용</button>
                  <button type="button" onClick={() => beginCustomize(step)}><Pencil size={14} aria-hidden="true" /> 직접 수정</button>
                  <button type="button" className={decision === "keep" ? "is-selected" : ""} aria-pressed={decision === "keep"} onClick={() => choose(step.id, "keep")}>현재 상태 유지</button>
                </div>
                {demands.length > 0 && <p className="repair-demand-note">{demands.map((demand) => demand.label).join(", ")}에서 감지됨.</p>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="sticky-action-bar">
        <p>어려움 {repairSteps.length}개 중 <strong>{reviewed}</strong>개 검토함 <span aria-hidden="true"> / </span> 개선안 <strong>{ready}</strong>개 준비됨</p>
        <button type="button" className="button button--secondary" onClick={() => goTo("journey")}><ArrowLeft size={16} aria-hidden="true" /> 분석 결과</button>
        <ArrowButton onClick={() => goTo("constraint")} disabled={repairSteps.length > 0 && reviewed === 0}>접근 조건 확인하기</ArrowButton>
      </div>
    </main>
  );
}

/**
 * What the engine measured for the graph being tested. Conditions that have a
 * real measurement behind them use it instead of the model's per-step rating:
 * a rating is an impression of one step in isolation, and reading instructions
 * was being failed for working memory on that basis alone.
 */
export interface ConditionContext {
  memory: EngineReport["memory"];
  timing: EngineReport["timing"];
}

interface ConditionDefinition {
  id: ConditionId;
  label: string;
  icon: typeof CircleGauge;
  fails: (step: Step, context: ConditionContext) => boolean;
  /** Set when the task graph carries nothing that answers this condition. The
   *  screen then says so rather than reporting a result it cannot support. */
  unavailable?: boolean;
  /** Shown in place of results, naming what is missing. */
  unavailableReason?: string;
}

export const CONDITIONS: ConditionDefinition[] = [
  {
    id: "working_memory",
    label: "작업 기억 의존도 완화",
    icon: CircleGauge,
    // Measured by the liveness pass, not by the step's own rating.
    //
    // The threshold is two rather than one. This condition asks what happens to
    // a student whose working memory is reduced, so it has to sit below the
    // ~4-chunk typical capacity (Cowan, 2001) without firing on every step: one
    // idea carried through a task is ordinary, and counting it failed nine
    // steps out of eleven and told the educator nothing. Producing information
    // that disappears fails on its own, because that is what forces the student
    // to memorise or transcribe it.
    fails: (step, { memory }) =>
      (memory.perStep.find((entry) => entry.stepId === step.id)?.load ?? 0) >= 2 ||
      (step.produces.length > 0 && !step.producedInfoStaysVisible),
  },
  // Whether a step has a keyboard route is a property of the software, and
  // nothing in the task graph records it. Motor difficulty is a different
  // question, so reusing that answer here would be a guess wearing a label.
  {
    id: "keyboard_only",
    label: "키보드만 사용",
    icon: Keyboard,
    fails: () => false,
    unavailable: true,
    unavailableReason:
      "각 단계를 마우스 없이 완료할 수 있는지는 그 소프트웨어의 동작 방식에 달려 있으며, 과제 지문만으로는 알 수 없습니다. 소근육 정밀도는 “제한된 소근육 정밀도” 항목에서 별도로 측정됩니다.",
  },
  { id: "fine_motor", label: "제한된 소근육 정밀도", icon: MousePointer2, fails: (step) => step.demands.fineMotor >= 2 },
  { id: "no_spoken", label: "말하기 응답 불가", icon: Mic, fails: (step) => step.demands.communication === "spoken" },
  { id: "no_audio", label: "소리 없이", icon: Volume2, fails: (step) => step.demands.sensory.audioOnly },
  { id: "no_color", label: "색상 정보 없이", icon: Sparkles, fails: (step) => step.demands.sensory.colorOnly },
  {
    id: "processing_time",
    label: "추가 처리 시간 필요",
    icon: Clock3,
    // A step fails when a timer the assignment actually states is running
    // during it. A step rated pressured with no stated clock is the model's
    // impression, and no repair could ever clear it.
    fails: (step, { timing }) =>
      timing.constraints.some((constraint) => constraint.stepIds.includes(step.id)),
  },
  {
    id: "reduced_motion",
    label: "움직임 최소화",
    icon: RotateCcw,
    fails: () => false,
    unavailable: true,
    unavailableReason:
      "부담 스키마는 움직임이나 애니메이션을 다루지 않으므로, Homework evaluator는 결과를 임의로 만들어내지 않습니다.",
  },
];

export interface ConstraintTestProps {
  analysis: Analysis;
  /** The same graph with accepted repairs applied, so results can be recomputed. */
  repairedAnalysis: Analysis;
  report: EngineReport;
  repairedReport: EngineReport;
  condition: string;
}

export function ConstraintTest({ analysis, repairedAnalysis, report, repairedReport, condition }: ConstraintTestProps) {
  const { goTo, selectCondition } = useWorkflow();
  const selected = CONDITIONS.find((item) => item.id === condition) ?? CONDITIONS[0];
  const unavailable = selected.unavailable === true;

  // Each graph is judged against its own measurements, so a repair that changes
  // what the engine measures changes the result rather than only the rating.
  const base: ConditionContext = { memory: report.memory, timing: report.timing };
  const after: ConditionContext = {
    memory: repairedReport.memory,
    timing: repairedReport.timing,
  };
  const failedSteps = analysis.steps.filter((step) => selected.fails(step, base));

  // Recomputed, not projected: the repaired graph is run through the same
  // predicate, so a step only reads "PASS after repair" when it genuinely does.
  const repairedById = useMemo(
    () => new Map(repairedAnalysis.steps.map((step) => [step.id, step])),
    [repairedAnalysis],
  );
  const stillFailing = failedSteps.filter((step) => {
    const repaired = repairedById.get(step.id);
    return !repaired || selected.fails(repaired, after);
  });
  const fixedCount = failedSteps.length - stillFailing.length;
  const focusedStep = stillFailing[0] ?? failedSteps[0] ?? analysis.steps[0];
  const focusedRepaired = focusedStep ? repairedById.get(focusedStep.id) : undefined;
  const focusedFixed = Boolean(
    focusedStep &&
      selected.fails(focusedStep, base) &&
      focusedRepaired &&
      !selected.fails(focusedRepaired, after),
  );


  return (
    <main id="main-content" className="workflow-main constraint-screen">
      <ScreenHeading title="접근 조건 확인" subtitle="접근 조건을 선택하고, 개선 전후에 달라진 부분을 확인하세요." />
      <div className="constraint-grid">
        <aside className="condition-list" aria-labelledby="conditions-title">
          <h2 id="conditions-title">기능적 조건</h2>
          {CONDITIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => selectCondition(item.id)} className={item.id === selected.id ? "is-selected" : ""} aria-pressed={item.id === selected.id}>
                <Icon size={16} aria-hidden="true" /><span>{item.label}</span>{item.unavailable && <small>데이터 없음</small>}
              </button>
            );
          })}
        </aside>

        <section className="journey-results" aria-labelledby="results-title">
          <div className="result-heading">
            <div><h2 id="results-title">{selected.label}</h2></div>
            {!unavailable && (
              <span>
                {fixedCount > 0
                  ? `전체 ${analysis.steps.length}단계 중 ${stillFailing.length}단계에 어려움이 남았습니다. 개선 후 ${fixedCount}단계 해결`
                  : `전체 ${analysis.steps.length}단계 중 ${failedSteps.length}단계에서 어려움이 예상됩니다`}
              </span>
            )}
          </div>
          {unavailable ? (
            <div className="unavailable-state"><selected.icon size={24} aria-hidden="true" /><h3>과제 데이터에 나타나지 않음</h3><p>{selected.unavailableReason}</p></div>
          ) : (
            <ol className="test-steps">
              {analysis.steps.map((step, index) => {
                const fails = selected.fails(step, base);
                const repaired = repairedById.get(step.id);
                const fixed = fails && repaired !== undefined && !selected.fails(repaired, after);
                return (
                  <li key={step.id}>
                    <span>{index + 1}</span>
                    <p>{step.action}</p>
                    {fixed ? (
                      <strong className="result-fixed">
                        <s>실패</s> 개선 후 통과
                      </strong>
                    ) : (
                      <strong className={fails ? "result-fail" : "result-pass"}>{fails ? "실패" : "통과"}</strong>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {!unavailable && stillFailing.length > 0 && (
            <article className="failure-explanation">
              <h3>어려움이 남은 단계: {focusedStep.action}</h3>
              <p>{focusedStep.relevanceReason}</p>
              {focusedFixed && focusedStep.repair ? (
                <span>
                  <CheckCircle2 size={15} aria-hidden="true" /> 채택한 개선안으로 이 단계의 이 조건이 해결됩니다
                </span>
              ) : <span>채택된 개선안 중 이 단계의 이 조건을 바꾸는 것은 없습니다.</span>}
            </article>
          )}
        </section>

        <aside className="condition-preview" aria-labelledby="preview-title">
          <h2 id="preview-title">이 단계의 변경 내용</h2>
          <p>{focusedStep.action}</p>
          {focusedFixed && focusedStep.repair ? (
            <><div className="preview-results"><p>과제 지원 내용</p><strong>{focusedStep.repair.suggestion}</strong></div><p className="preview-assurance"><Check size={14} aria-hidden="true" /> 작업 중에도 참고 자료가 계속 제공됩니다.</p></>
          ) : (
            <p className="preview-empty">선택한 조건에서는 이 단계에 제안된 변경 사항이 없습니다.</p>
          )}
          <dl className="compact-metrics"><div><dt>과제 환경 수</dt><dd>{report.switching.uniqueEnvironments.length}{repairedReport.switching.uniqueEnvironments.length !== report.switching.uniqueEnvironments.length ? ` → ${repairedReport.switching.uniqueEnvironments.length}` : ""}</dd></div><div><dt>활성 타이머</dt><dd>{report.timing.constraints.length || "없음"}{repairedReport.timing.constraints.length !== report.timing.constraints.length ? ` → ${repairedReport.timing.constraints.length || "없음"}` : ""}</dd></div></dl>
        </aside>
      </div>
      <div className="screen-footer-actions"><button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> 개선안으로 돌아가기</button><ArrowButton onClick={() => goTo("preview")}>수정본 확인하기</ArrowButton></div>
    </main>
  );
}

export interface StudentPreviewProps {
  objective: string;
  steps: Step[];
  appliedRepairIds: string[];
  assignmentText: string;
  /** Identifies the exact inputs this revision belongs to, so a rewrite left over
   *  from a different set of accepted repairs is never shown or exported. */
  revisionKey: string;
  existingRevision: RevisedAssignment | null;
  onRevised: (revisionKey: string, revised: RevisedAssignment) => void;
  /** The finished student handout, once a revision exists. */
  handoutHtml: string | null;
}

interface AccessTool {
  id: string;
  label: string;
  hint: string;
}

const ACCESS_TOOLS: AccessTool[] = [
  { id: "spacing", label: "간격 넓히기", hint: "줄 간격과 자간을 넓힙니다" },
  { id: "declutter", label: "시각적 요소 줄이기", hint: "수정된 과제만 표시합니다" },
  { id: "readAloud", label: "소리 내어 읽기", hint: "수정된 과제를 음성으로 읽어줍니다" },
];

/** Wraps the changed words in <mark>; falls back to plain text when no comparison is available. */
function renderDiff(segments: DiffSegment[] | undefined, fallback: string, kind: "added" | "removed") {
  if (!segments) return fallback;
  return segments.map((segment, index) =>
    segment.changed ? (
      <mark key={index} className={`revision-${kind}`}>{segment.text}</mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

export function StudentPreview({ objective, steps, appliedRepairIds, assignmentText, revisionKey, existingRevision, onRevised, handoutHtml }: StudentPreviewProps) {
  const { goTo } = useWorkflow();
  const [tools, setTools] = useState<Record<string, boolean>>({ spacing: false, declutter: false, readAloud: false });
  // Held against the inputs it was generated from. Changing a repair decision
  // therefore retires the old rewrite instead of leaving it on screen beside a
  // repair list it no longer matches.
  const [result, setResult] = useState<{ key: string; value: RevisedAssignment } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const revised = existingRevision ?? (result?.key === revisionKey ? result.value : null);
  const message = failure?.key === revisionKey ? failure.message : "";

  const accepted = useMemo(
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

  const previewSteps = useMemo(
    () => steps.map((step) => ({ id: step.id, action: step.action })),
    [steps],
  );

  useEffect(() => {
    if (accepted.length === 0 || revised !== null) return;
    let cancelled = false;
    generatePreview(assignmentText, objective, accepted, previewSteps)
      .then((value) => {
        if (cancelled) return;
        setResult({ key: revisionKey, value });
        onRevised(revisionKey, value);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure({
          key: revisionKey,
          message: error instanceof Error ? error.message : "과제를 다시 작성할 수 없습니다.",
        });
      });
    return () => { cancelled = true; };
  }, [assignmentText, objective, accepted, previewSteps, revisionKey, revised, onRevised, retryNonce]);

  const loading = accepted.length > 0 && revised === null && message === "";
  const diff = useMemo(
    () => (revised ? diffWords(assignmentText, revised.revisedText) : null),
    [assignmentText, revised],
  );

  function retryRewrite() {
    setFailure(null);
    setRetryNonce((value) => value + 1);
  }

  // Read aloud uses the browser's own speech synthesis, so it works without a
  // network call and stops cleanly when switched off or when leaving the screen.
  useEffect(() => {
    const speech = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!speech) return;
    if (!tools.readAloud || !revised) {
      speech.cancel();
      return;
    }
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(`${revised.title}. ${revised.revisedText}`);
    utterance.rate = 0.95;
    speech.speak(utterance);
    return () => speech.cancel();
  }, [tools.readAloud, revised]);

  return (
    <main id="main-content" className="workflow-main student-preview-screen">
      <ScreenHeading title="수정본 확인" subtitle="원본과 비교한 뒤, 학생에게 줄 안내를 확인하세요." />

      <details className="preview-options"><summary>보기 설정</summary>
        <aside className="access-tools" aria-labelledby="tools-title">
          <h2 id="tools-title">표시 방식</h2>
          <p>읽기 편한 방식을 선택하세요.</p>
          <div>
            {ACCESS_TOOLS.map((tool) => (
              <label key={tool.id}>
                <span>
                  {tool.label}
                  <small>{tool.hint}</small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(tools[tool.id])}
                  onChange={(event) =>
                    setTools((current) => ({ ...current, [tool.id]: event.target.checked }))
                  }
                />
              </label>
            ))}
          </div>
        </aside>
      </details>

      <section
        className={`revision-compare${tools.spacing ? " is-spaced" : ""}${tools.declutter ? " is-decluttered" : ""}`}
        aria-label="원본 및 수정된 과제"
      >
        <article className="student-assignment">
          <header><p>원본</p><span>현재 학생들이 받는 과제</span></header>
          <section className="student-goal"><h2>학습 목표</h2><p>{objective}</p></section>
          <pre className="assignment-body">{renderDiff(diff?.original, assignmentText, "removed")}</pre>
        </article>

        <article className="student-assignment student-assignment--revised">
          <header>
            <p>수정본</p>
            <span>{revised ? revised.title : "채택한 개선안이 반영된 버전"}</span>
          </header>
          <section className="student-goal"><h2>학습 목표</h2><p>{objective}</p></section>

          {accepted.length === 0 && (
            <p className="revision-empty">
              아직 채택된 개선안이 없습니다. 개선 계획 화면으로 돌아가 개선안을 적용하면
              여기에 수정된 과제가 나타납니다.
            </p>
          )}

          {loading && (
            <p className="revision-empty" aria-live="polite">
              <Sparkles size={15} aria-hidden="true" /> 채택한 개선안 {accepted.length}개를 반영해
              과제를 다시 작성하는 중…
            </p>
          )}

          {message !== "" && (
            <div className="revision-empty revision-empty--error" role="alert">
              <ErrorBanner message={message} />
              <button type="button" className="button button--small button--secondary" onClick={retryRewrite}>다시 시도</button>
            </div>
          )}

          {revised && diff && (
            <p className="revision-legend">
              <mark className="revision-added">표시된 부분</mark>이 원본에서 바뀐 내용입니다.
            </p>
          )}

          {revised && (
            <pre className="assignment-body">{renderDiff(diff?.revised, revised.revisedText, "added")}</pre>
          )}
        </article>
      </section>

      {revised && revised.changes.length > 0 && (
        <section className={`revision-changes${tools.declutter ? " is-hidden" : ""}`} aria-labelledby="changes-title">
          <h2 id="changes-title">바뀐 내용과 이유</h2>
          <ol>
            {revised.changes.map((change) => (
              <li key={change.what}>
                <p><Check size={15} aria-hidden="true" /> {change.what}</p>
                <span>{change.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {handoutHtml && (
        <section className="handout-preview" aria-labelledby="handout-title">
          <header>
            <h2 id="handout-title">학생용 화면 미리보기</h2>
            <p>학생이 내려받을 HTML 파일과 똑같은 화면입니다. 단계별 안내가 올바른 순서인지 확인하세요.</p>
          </header>
          <iframe title="학생용 HTML 미리보기" srcDoc={handoutHtml} sandbox="allow-scripts" />
        </section>
      )}

      <div className="screen-footer-actions">
        <button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> 개선안으로 돌아가기</button>
        {message !== "" ? (
          <button type="button" className="button button--secondary" onClick={() => goTo("complete")}>수정된 과제 없이 분석 마치기</button>
        ) : (
          <ArrowButton onClick={() => goTo("complete")} disabled={loading}>
            {loading ? "다시 작성되기를 기다리는 중…" : "분석 마치기"}
          </ArrowButton>
        )}
      </div>
    </main>
  );
}

export interface CompleteScreenProps {
  frictionCount: number;
  /** How many of those no longer appear once the accepted repairs are applied,
   *  recomputed from the repaired graph rather than assumed from the count. */
  frictionResolved: number;
  frictionUnverified: number;
  repairsApplied: number;
  goalPreserved: boolean;
  onExport: () => void;
  canExport: boolean;
}

export function CompleteScreen({ frictionCount, frictionResolved, frictionUnverified, repairsApplied, goalPreserved, onExport, canExport }: CompleteScreenProps) {
  const { startOver, goTo } = useWorkflow();
  const unresolved = frictionCount - frictionResolved - frictionUnverified;
  const remainingSummary = `아직 해결되지 않은 어려움이 ${unresolved}개 남아 있습니다${frictionUnverified > 0 ? `. 그리고 과제 데이터로는 결과를 확인할 수 없는 항목이 ${frictionUnverified}개 있습니다` : ""}.`;
  return (
    <main id="main-content" className="complete-screen">
      <div className="complete-mark" aria-hidden="true"><span /><span /><span /></div>
      <h1 data-screen-heading tabIndex={-1}>{canExport ? "수정된 과제가 준비되었습니다." : "분석이 완료되었습니다."}</h1>
      <p className="complete-intro">
        {!canExport
          ? "분석 결과를 저장했습니다. 수정본이 없어 학생용 안내는 아직 내려받을 수 없습니다."
          : frictionResolved === frictionCount
          ? "Homework evaluator가 발견한 모든 어려움이 수정된 과제에서 해결되었으며, 학습 목표는 변하지 않았습니다."
          : `채택한 개선안이 적용되어 과제가 다시 측정되었습니다. ${remainingSummary}`}
      </p>
      <div className="completion-facts">
        <p><CheckCircle2 size={18} aria-hidden="true" /><span>학습 목표 {goalPreserved ? "유지됨" : "검토 필요"}</span></p>
        <p><span>{frictionResolved}<em> / </em>{frictionCount}</span><small>어려움 해결됨</small></p>
        {frictionUnverified > 0 && <p><span>{frictionUnverified}</span><small>결과 확인 불가</small></p>}
        <p><span>{repairsApplied}</span><small>개선안 적용됨</small></p>
      </div>
      <div className="complete-actions">
        {canExport && <button type="button" className="button button--primary" onClick={onExport}>
          학생용 안내 내려받기 <ArrowRight size={16} aria-hidden="true" />
        </button>}
        <button type="button" className="button button--secondary" onClick={startOver}>새 분석 시작하기</button>
      </div>
      {!canExport && (
        <button type="button" className="text-button" onClick={() => goTo("preview")}>수정본 다시 확인하기</button>
      )}
      <p className="educator-note">AI 분석에서 놓친 내용이 있을 수 있습니다. 배포 전에 원본과 학습 목표를 직접 확인해 주세요.</p>
    </main>
  );
}
