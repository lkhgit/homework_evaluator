"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  FileText,
  Keyboard,
  Link2,
  LockKeyhole,
  Mic,
  MousePointer2,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import DemandChips, { chipsForDemands } from "@/components/DemandChips";
import { useWorkflow, type ConditionId } from "@/components/WorkflowContext";
import { generatePreview } from "@/lib/analysisSource";
import type { EngineReport } from "@/lib/engine";
import { locateEvidence } from "@/lib/evidenceGuard";
import { timeConstraintChangesOf } from "@/lib/schema";
import type { Analysis, FrictionMoment, GoalRelevance, RepairEffects, RevisedAssignment, Step } from "@/lib/schema";

function ScreenHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="screen-heading">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
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
  text: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** True once an analysis exists, so re-running is a replacement, not a first run. */
  hasAnalysis?: boolean;
}

export function AnalyzeScreen({ text, onChange, onSubmit, hasAnalysis = false }: AnalyzeScreenProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [fileNote, setFileNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setReading(true);
    setFileNote(null);
    try {
      const { extractPdfText } = await import("@/lib/pdfText");
      const extracted = await extractPdfText(file);
      onChange(extracted);
      const words = extracted.split(/\s+/).length;
      setFileNote({ tone: "ok", text: `${file.name}에서 단어 ${words.toLocaleString()}개를 읽었습니다. 아래에서 확인한 뒤 분석하세요.` });
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
    <main className="workflow-main">
      <ScreenHeading
        eyebrow={hasAnalysis ? "과제" : "새 분석"}
        title={hasAnalysis ? "내 과제" : "학습 과제 분석하기"}
        subtitle={
          hasAnalysis
            ? "내용을 수정하고 다시 분석하거나, 위 단계를 이용해 결과 화면으로 돌아가세요."
            : "과제 내용을 붙여넣거나, 파일을 업로드하거나, 온라인 학습 경험을 제공하세요."
        }
      />

      <div className="analysis-grid">
        <section className="document-panel" aria-labelledby="assignment-input-heading">
          <div className="input-tabs" role="tablist" aria-label="과제 입력 방식">
            <button type="button" role="tab" aria-selected="true" id="assignment-input-heading">
              <FileText size={16} aria-hidden="true" /> 텍스트 붙여넣기
            </button>
            <button
              type="button"
              role="tab"
              aria-selected="false"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
            >
              <Upload size={15} aria-hidden="true" /> {reading ? "PDF 읽는 중…" : "PDF 업로드"}
            </button>
            <button type="button" role="tab" aria-selected="false" disabled>
              <Link2 size={15} aria-hidden="true" /> URL 입력 <span>준비 중</span>
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="PDF 과제 업로드"
            onChange={handleFile}
          />
          {fileNote && (
            <p
              className={`file-note ${fileNote.tone === "error" ? "file-note--error" : ""}`}
              role={fileNote.tone === "error" ? "alert" : "status"}
            >
              {fileNote.text}
            </p>
          )}
          <label htmlFor="assignment-text" className="sr-only">과제 내용</label>
          <textarea
            id="assignment-text"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            aria-describedby="prototype-note"
          />
          <div className="document-footer">
            <p id="prototype-note">
              {hasAnalysis
                ? "다시 분석하면 현재 결과와 개선안이 대체됩니다."
                : "실시간으로 분석됩니다 · 샘플 과제는 즉시 결과가 나옵니다"}
            </p>
            <ArrowButton onClick={onSubmit} disabled={text.trim().length === 0 || reading}>
              {hasAnalysis ? "과제 다시 분석하기" : "과제 분석하기"}
            </ArrowButton>
          </div>
        </section>

        <aside className="tips-panel" aria-labelledby="tips-title">
          <div className="tips-icon" aria-hidden="true"><Sparkles size={18} /></div>
          <h2 id="tips-title">더 나은 분석을 위해</h2>
          <ul>
            <li><Check size={15} aria-hidden="true" /> 학생용 지시문 전체를 포함하세요</li>
            <li><Check size={15} aria-hidden="true" /> 학습 목표를 포함하세요</li>
            <li><Check size={15} aria-hidden="true" /> 관련 있는 링크를 포함하세요</li>
          </ul>
          <div className="tip-note">
            <p>AccessLens가 살펴보는 것</p>
            <span>행동, 전환, 기억 부담, 상호작용 정밀도, 시간, 응답 방식.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

/**
 * Two passes run against the model, and they do different work. Showing the
 * same six messages for both made the first pass claim it had traced friction
 * and prepared recommendations when it had only read the assignment — and then
 * Goal Lock asked the educator to confirm a goal the app implied it had already
 * finished working from.
 */
const PHASE_COPY = {
  objective: {
    eyebrow: "1/2단계 · 과제 읽는 중",
    messages: [
      "과제를 읽는 중…",
      "무엇을 가르치려는 과제인지 파악하는 중…",
    ],
    /** Objective extraction usually returns in a few seconds. */
    cadenceMs: 1800,
  },
  analysis: {
    eyebrow: "2/2단계 · 과제를 여정으로 분석하는 중",
    messages: [
      "과제를 학생의 행동 단위로 나누는 중…",
      "기능적 부담을 매핑하는 중…",
      "접근성 마찰을 추적하는 중…",
      "부담을 학습 목표와 비교하는 중…",
      "개선안을 준비하는 중…",
    ],
    /** The full analysis runs far longer, so the messages are paced to match. */
    cadenceMs: 7000,
  },
} as const;

export type LoadingPhase = keyof typeof PHASE_COPY;

export function AnalysisLoadingScreen({ phase = "analysis" }: { phase?: LoadingPhase }) {
  const { eyebrow, messages, cadenceMs } = PHASE_COPY[phase];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => Math.min(current + 1, messages.length - 1));
    }, cadenceMs);
    return () => window.clearInterval(timer);
  }, [messages.length, cadenceMs]);

  const onLastMessage = messageIndex === messages.length - 1;

  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="neural-loader" aria-hidden="true">
        <span />
        <i /><i /><i /><i />
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h1 data-screen-heading tabIndex={-1}>{messages[messageIndex]}</h1>
      <p>
        {onLastMessage
          ? "아직 진행 중입니다 — 과제가 길수록 시간이 더 걸립니다."
          : `${messages.length}단계 중 ${messageIndex + 1}단계`}
      </p>
    </main>
  );
}

export interface GoalLockScreenProps {
  objective: string;
  onEdit: (objective: string) => void;
  onLock: () => void;
}

export function GoalLockScreen({ objective, onEdit, onLock }: GoalLockScreenProps) {
  const [editing, setEditing] = useState(false);
  const [locked, setLocked] = useState(false);

  return (
    <main className="workflow-main goal-screen">
      <ScreenHeading
        eyebrow="목표 확정"
        title="학습 목표 확정하기"
        subtitle="학생들이 실제로 배워야 할 것이 무엇인지 확인하세요. AccessLens는 접근성 개선을 제안하는 동안 이 목표를 그대로 지킵니다."
      />
      <section className={`goal-orbit ${locked ? "is-locked" : ""}`} aria-labelledby="goal-label">
        <span className="goal-ring goal-ring--one" aria-hidden="true" />
        <span className="goal-ring goal-ring--two" aria-hidden="true" />
        <span className="goal-lock-icon" aria-hidden="true"><LockKeyhole size={21} /></span>
        <div className="goal-content">
          <p className="eyebrow" id="goal-label">학습 목표</p>
          {editing ? (
            <textarea value={objective} onChange={(event) => onEdit(event.target.value)} aria-label="학습 목표" autoFocus />
          ) : (
            <blockquote>“{objective}”</blockquote>
          )}
        </div>
      </section>

      {!locked ? (
        <div className="goal-actions">
          <button type="button" className="button button--secondary" onClick={() => setEditing((value) => !value)}>
            <Pencil size={16} aria-hidden="true" /> {editing ? "수정 완료" : "목표 수정"}
          </button>
          <button type="button" className="button button--primary" onClick={() => { setEditing(false); setLocked(true); }} disabled={!objective.trim()}>
            <LockKeyhole size={16} aria-hidden="true" /> 목표 확인 및 확정
          </button>
        </div>
      ) : (
        <div className="goal-confirmation" aria-live="polite">
          <p><CheckCircle2 size={18} aria-hidden="true" /> 목표가 확정되었습니다</p>
          <span>개선안은 학생이 학습에 접근하거나 학습을 증명하는 방식을 바꿀 수는 있지만, 학생이 배워야 할 내용 자체는 바꾸지 않습니다.</span>
          <ArrowButton onClick={onLock}>계속하기</ArrowButton>
        </div>
      )}
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
  const journeyPathRef = useRef<HTMLOListElement>(null);
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
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const usesVerticalTimeline = window.matchMedia("(max-width: 580px)").matches;
    window.requestAnimationFrame(() => {
      const scrollTarget = usesVerticalTimeline
        ? document.getElementById("journey-step-detail")
        : journeyPathRef.current?.children[index];
      scrollTarget?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: usesVerticalTimeline ? "start" : "nearest",
        inline: "center",
      });
    });
  }

  function affectedStepNumbers(friction: FrictionMoment): string {
    return friction.stepIds
      .map((stepId) => analysis.steps.findIndex((step) => step.id === stepId) + 1)
      .filter((stepNumber) => stepNumber > 0)
      .join(", ");
  }

  return (
    <main className="workflow-main journey-screen">
      <ScreenHeading
        eyebrow="여정 분석"
        title="학생의 여정으로 본 과제"
        subtitle="과제를 학생의 실제 행동 단위로 나누어 접근성 마찰이 어디서 발생하는지 드러냅니다."
      />
      <section className="journey-explorer" aria-labelledby="journey-overview-title">
        <header className="journey-toolbar">
          <div>
            <p className="eyebrow">여정 개요</p>
            <h2 id="journey-overview-title">단계별로 과제를 따라가보세요</h2>
            <p>단계를 선택하면 해당 환경, 부담, 접근성 마찰을 자세히 볼 수 있습니다.</p>
          </div>
          <nav className="journey-controls" aria-label="여정 단계 이동">
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

        <dl className="journey-summary" aria-label="여정 요약">
          <div><dt>마찰 지점</dt><dd>{analysis.frictionMoments.length}</dd></div>
          <div><dt>목표와 무관한 부담</dt><dd>{incidental}</dd></div>
          <div><dt>위험이 있는 필수 부담</dt><dd>{essentialRisks}</dd></div>
          <div><dt>학습 환경 수</dt><dd>{report.switching.uniqueEnvironments.length}</dd></div>
        </dl>

        <div className="journey-scroll" aria-label={`전체 ${analysis.steps.length}개 과제 단계`}>
          <ol className="journey-path" ref={journeyPathRef}>
          {analysis.steps.map((step, index) => {
            const frictions = frictionByStep.get(step.id) ?? [];
            const primaryFriction = frictions[0];
            const isSelected = step.id === selectedStep?.id;
            return (
              <li key={step.id} className={`journey-step${isSelected ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="journey-card"
                  onClick={() => selectStep(index)}
                  aria-current={isSelected ? "step" : undefined}
                  aria-controls="journey-step-detail"
                >
                  <span className="journey-card-topline">
                    <span className="node-number">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`relevance-pill relevance-${step.goalRelevance}`}>{RELEVANCE_LABEL[step.goalRelevance]}</span>
                  </span>
                  <strong className="node-label">{nodeLabel(step.action)}</strong>
                  <span className="journey-environment"><Link2 size={14} aria-hidden="true" /> {step.environment}</span>
                  {primaryFriction ? (
                    <span className={`journey-status severity-${primaryFriction.severity}`}>
                      <AlertTriangle size={14} aria-hidden="true" />
                      {SEVERITY_LABEL[primaryFriction.severity]}
                      {frictions.length > 1 && <small>{frictions.length}건</small>}
                    </span>
                  ) : (
                    <span className="journey-status journey-status--clear"><Check size={14} aria-hidden="true" /> 마찰 없음</span>
                  )}
                </button>
              </li>
            );
          })}
          </ol>
        </div>

        {selectedStep && (
          <article className="journey-step-detail" id="journey-step-detail" aria-labelledby="selected-step-title">
            <div className="journey-step-context">
              <p className="eyebrow">선택한 단계 · {String(selectedStepIndex + 1).padStart(2, "0")}</p>
              <h2 id="selected-step-title">{imperativeAction(selectedStep.action)}</h2>
              <div className="journey-step-meta">
                <span><Link2 size={14} aria-hidden="true" /> {selectedStep.environment}</span>
                <span>목표와의 관련성: {RELEVANCE_LABEL[selectedStep.goalRelevance]}</span>
              </div>
              <div className="journey-demand-block">
                <h3>기능적 부담</h3>
                <DemandChips demands={selectedStep.demands} />
              </div>
            </div>

            <div className="journey-friction-detail">
              {selectedFrictions.length > 0 ? (
                <>
                  <p className="eyebrow">이 단계의 마찰 지점</p>
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
                          마찰 지점 검토하기 <ArrowRight size={15} aria-hidden="true" />
                        </button>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <div className="journey-no-friction">
                  <span><CheckCircle2 size={19} aria-hidden="true" /></span>
                  <div>
                    <h3>여기서는 마찰이 발견되지 않았습니다</h3>
                    <p>이 단계에서는 접근성 장벽이 감지되지 않았습니다.</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        )}
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
  const { goTo, applyRepair } = useWorkflow();
  const category = BARRIER_CATEGORY_LABEL[friction.barrierType] ?? friction.barrierType.replaceAll("_", " ");
  return (
    <main className="workflow-main">
      <ScreenHeading eyebrow="마찰" title="장벽 추적" subtitle="무엇이 방해가 되고 있는지, 그리고 그 이유를 확인하세요." />
      <div className="barrier-grid">
        <section className="excerpt-panel" aria-labelledby="excerpt-title">
          <div className="document-masthead">
            <div><span className="paper-dot" aria-hidden="true" /><span className="paper-dot" aria-hidden="true" /><span className="paper-dot" aria-hidden="true" /></div>
            <p id="excerpt-title">과제 발췌</p>
          </div>
          <HighlightedEvidence assignmentText={assignmentText} evidence={step.evidence} />
        </section>
        <article className="barrier-detail">
          <div className="barrier-meta">
            <span>{category}</span>
            <strong className={`severity-text severity-${friction.severity}`}>심각도 {SEVERITY_LABEL[friction.severity]}</strong>
          </div>
          <h2>{friction.title}</h2>
          <dl>
            <div><dt>왜 발견되었는가</dt><dd>{friction.explanation}</dd></div>
            <div><dt>왜 중요한가</dt><dd>{step.relevanceReason}</dd></div>
            <div><dt>목표와의 관련성</dt><dd className="goal-relevance-value">{RELEVANCE_LABEL[step.goalRelevance]}</dd></div>
            <div><dt>제안된 개선안</dt><dd>{step.repair?.suggestion ?? "학생 여정 화면에서 이 단계를 다시 검토해보세요."}</dd></div>
          </dl>
          <p className="citation"><BookOpen size={15} aria-hidden="true" /> {citation}</p>
          <div className="barrier-actions">
            <button type="button" className="button button--secondary" onClick={() => goTo("journey")}><ArrowLeft size={16} aria-hidden="true" /> 여정으로 돌아가기</button>
            <button type="button" className="button button--primary" onClick={() => { applyRepair(step.id); goTo("repair"); }}><Check size={16} aria-hidden="true" /> 개선안 적용</button>
            <button type="button" className="button button--secondary" onClick={() => goTo("preview")}>학생용 미리보기 보기 <ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </article>
      </div>
    </main>
  );
}

export interface RepairScreenProps {
  steps: Step[];
  /** Repairs already accepted elsewhere — the Barrier Trace has its own Apply
   *  button, and arriving here to be told nothing was applied would be wrong. */
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
  return labels.length > 0 ? labels : ["결정론적으로 측정되는 변화 없음"];
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
    <main className="workflow-main repair-screen">
      <ScreenHeading eyebrow="개선" title="개선 계획" subtitle="학습 목표를 지키면서 제안된 접근성 개선안을 검토하세요." />
      <div className="repair-list">
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
                    {customError && <p role="alert" className="customize-error">{customError}</p>}
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
                  <button type="button" className={decision === "apply" ? "is-selected" : ""} onClick={() => choose(step.id, "apply")}><Check size={14} aria-hidden="true" /> 적용</button>
                  <button type="button" onClick={() => beginCustomize(step)}><Pencil size={14} aria-hidden="true" /> 직접 수정</button>
                  <button type="button" className={decision === "keep" ? "is-selected" : ""} onClick={() => choose(step.id, "keep")}>현재 상태 유지</button>
                </div>
                {demands.length > 0 && <p className="repair-demand-note">{demands.map((demand) => demand.label).join(", ")}에서 감지됨.</p>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="sticky-action-bar">
        <p>장벽 {repairSteps.length}개 중 <strong>{reviewed}</strong>개 검토함 <span aria-hidden="true">·</span> 개선안 <strong>{ready}</strong>개 준비됨</p>
        <button type="button" className="button button--secondary" onClick={() => goTo("barrier")}><ArrowLeft size={16} aria-hidden="true" /> 마찰 지점으로 돌아가기</button>
        <ArrowButton onClick={() => goTo("constraint")} disabled={reviewed === 0}>테스트로 계속하기</ArrowButton>
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
      "부담 스키마는 움직임이나 애니메이션을 다루지 않으므로, AccessLens는 결과를 임의로 만들어내지 않습니다.",
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
  const [visibleCount, setVisibleCount] = useState(0);

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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= analysis.steps.length) {
          window.clearInterval(timer);
          return count;
        }
        return count + 1;
      });
    }, 90);
    return () => window.clearInterval(timer);
  }, [condition, analysis.steps.length]);

  return (
    <main className="workflow-main constraint-screen">
      <ScreenHeading eyebrow="검증" title="접근성 조건 테스트하기" subtitle="다양한 기능적 접근 조건에서 과제가 어디서 막히는지 확인하세요." />
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
            <div><p className="eyebrow">여정 결과</p><h2 id="results-title">{selected.label}</h2></div>
            {!unavailable && (
              <span>
                {fixedCount > 0
                  ? `전체 ${analysis.steps.length}단계 중 ${stillFailing.length}단계 실패 — 개선안으로 ${fixedCount}단계 해결됨`
                  : `전체 ${analysis.steps.length}단계 중 ${failedSteps.length}단계 실패`}
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
                  <li key={step.id} className={index < visibleCount ? "is-visible" : ""}>
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
              <p className="eyebrow">실패하는 이유</p>
              <h3>{focusedStep.action}</h3>
              <p>{focusedStep.relevanceReason}</p>
              {focusedFixed && focusedStep.repair ? (
                <span>
                  <CheckCircle2 size={15} aria-hidden="true" /> 채택한 개선안이 이 단계에서 이 조건을 해결합니다
                </span>
              ) : <span>채택된 개선안 중 이 단계의 이 조건을 바꾸는 것은 없습니다.</span>}
            </article>
          )}
        </section>

        <aside className="condition-preview" aria-labelledby="preview-title">
          <p className="eyebrow">학생용 미리보기</p>
          <h2 id="preview-title">{focusedStep.action}</h2>
          {focusedFixed && focusedStep.repair ? (
            <><div className="preview-results"><p>과제 지원 내용</p><strong>{focusedStep.repair.suggestion}</strong></div><p className="preview-assurance"><Check size={14} aria-hidden="true" /> 작업 중에도 참고 자료가 계속 제공됩니다.</p></>
          ) : (
            <p className="preview-empty">선택한 조건에서는 이 단계에 제안된 변경 사항이 없습니다.</p>
          )}
          <dl className="compact-metrics"><div><dt>과제 환경 수</dt><dd>{report.switching.uniqueEnvironments.length}{repairedReport.switching.uniqueEnvironments.length !== report.switching.uniqueEnvironments.length ? ` → ${repairedReport.switching.uniqueEnvironments.length}` : ""}</dd></div><div><dt>활성 타이머</dt><dd>{report.timing.constraints.length || "없음"}{repairedReport.timing.constraints.length !== report.timing.constraints.length ? ` → ${repairedReport.timing.constraints.length || "없음"}` : ""}</dd></div></dl>
        </aside>
      </div>
      <div className="screen-footer-actions"><button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> 개선안으로 돌아가기</button><button type="button" className="button button--secondary" onClick={() => selectCondition(CONDITIONS[0].id)}>다른 조건 테스트하기</button><ArrowButton onClick={() => goTo("preview")}>계속하기</ArrowButton></div>
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
}

interface AccessTool {
  id: string;
  label: string;
  hint: string;
  /** False when the control is not wired to behaviour yet; it is then shown as Roadmap
   *  rather than as a toggle that quietly does nothing. */
  live: boolean;
}

const ACCESS_TOOLS: AccessTool[] = [
  { id: "spacing", label: "간격 넓히기", hint: "줄 간격과 자간을 넓힙니다", live: true },
  { id: "declutter", label: "시각적 요소 줄이기", hint: "수정된 과제만 표시합니다", live: true },
  { id: "readAloud", label: "소리 내어 읽기", hint: "수정된 과제를 음성으로 읽어줍니다", live: true },
  { id: "chunk", label: "지시문 나누기", hint: "한 번에 한 단계씩", live: false },
  { id: "highlight", label: "현재 단계 강조", hint: "나머지는 흐리게 표시", live: false },
];

export function StudentPreview({ objective, steps, appliedRepairIds, assignmentText, revisionKey, existingRevision, onRevised }: StudentPreviewProps) {
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

  useEffect(() => {
    if (accepted.length === 0 || revised !== null) return;
    let cancelled = false;
    generatePreview(assignmentText, objective, accepted)
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
  }, [assignmentText, objective, accepted, revisionKey, revised, onRevised, retryNonce]);

  const loading = accepted.length > 0 && revised === null && message === "";

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
    <main className="workflow-main student-preview-screen">
      <ScreenHeading eyebrow="미리보기" title="학생용 미리보기" subtitle="같은 학업 내용을, 더 순조로운 경로로." />

      <section
        className={`revision-compare${tools.spacing ? " is-spaced" : ""}${tools.declutter ? " is-decluttered" : ""}`}
        aria-label="원본 및 수정된 과제"
      >
        <article className="student-assignment">
          <header><p>원본</p><span>현재 학생들이 받는 과제</span></header>
          <section className="student-goal"><p className="eyebrow">학습 목표</p><h2>{objective}</h2></section>
          <pre className="assignment-body">{assignmentText}</pre>
        </article>

        <article className="student-assignment student-assignment--revised">
          <header>
            <p>수정본</p>
            <span>{revised ? revised.title : "채택한 개선안이 반영된 버전"}</span>
          </header>
          <section className="student-goal"><p className="eyebrow">학습 목표</p><h2>{objective}</h2></section>

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
              <p>{message}</p>
              <button type="button" className="button button--small button--secondary" onClick={retryRewrite}>다시 시도</button>
            </div>
          )}

          {revised && (
            <pre className="assignment-body">{revised.revisedText}</pre>
          )}
        </article>
      </section>

      {revised && revised.changes.length > 0 && (
        <section className={`revision-changes${tools.declutter ? " is-hidden" : ""}`} aria-labelledby="changes-title">
          <h2 id="changes-title">무엇이, 왜 바뀌었는가</h2>
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

      <div className="student-layout">
        <aside className="access-tools" aria-labelledby="tools-title">
          <h2 id="tools-title">접근성 도구</h2>
          <p>과제가 표시되는 방식을 개인화하세요.</p>
          <div>
            {ACCESS_TOOLS.map((tool) => (
              <label key={tool.id} className={tool.live ? "" : "is-roadmap"}>
                <span>
                  {tool.label}
                  <small>{tool.hint}</small>
                </span>
                {tool.live ? (
                  <>
                    <input
                      type="checkbox"
                      checked={Boolean(tools[tool.id])}
                      onChange={(event) =>
                        setTools((current) => ({ ...current, [tool.id]: event.target.checked }))
                      }
                    />
                    <i aria-hidden="true" />
                  </>
                ) : (
                  <em>준비 중</em>
                )}
              </label>
            ))}
          </div>
        </aside>
      </div>
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
  scoreBefore: number;
  scoreAfter: number;
}

export function CompleteScreen({ frictionCount, frictionResolved, frictionUnverified, repairsApplied, goalPreserved, onExport, canExport, scoreBefore, scoreAfter }: CompleteScreenProps) {
  const { startOver } = useWorkflow();
  const unresolved = frictionCount - frictionResolved - frictionUnverified;
  const remainingSummary = `여전히 마찰 지점 ${unresolved}개가 남아 있습니다${frictionUnverified > 0 ? `. 그리고 과제 데이터로는 결과를 확인할 수 없는 항목이 ${frictionUnverified}개 있습니다` : ""}.`;
  return (
    <main className="complete-screen">
      <div className="complete-mark" aria-hidden="true"><span /><span /><span /></div>
      <p className="eyebrow">분석 완료</p>
      <h1 data-screen-heading tabIndex={-1}>{canExport ? "수정된 과제가 준비되었습니다." : "분석이 완료되었습니다."}</h1>
      <p className="complete-intro">
        {!canExport
          ? "과제가 측정되었고, 채택한 개선 결정이 기록되었습니다. 수정된 과제가 생성되지 않아 내보내기는 사용할 수 없습니다."
          : frictionResolved === frictionCount
          ? "AccessLens가 발견한 모든 마찰 지점이 수정된 과제에서 해결되었으며, 학습 목표는 변하지 않았습니다."
          : `채택한 개선안이 적용되어 과제가 다시 측정되었습니다. ${remainingSummary}`}
      </p>
      <div className="completion-facts">
        <p><CheckCircle2 size={18} aria-hidden="true" /><span>학습 목표 {goalPreserved ? "유지됨" : "검토 필요"}</span></p>
        <p><span>{frictionResolved}<em> / </em>{frictionCount}</span><small>마찰 지점 해결됨</small></p>
        {frictionUnverified > 0 && <p><span>{frictionUnverified}</span><small>결과 확인 불가</small></p>}
        <p><span>{repairsApplied}</span><small>개선안 적용됨</small></p>
        {scoreAfter > scoreBefore && (
          <p className="complete-delta">
            <span>{scoreBefore}<em> → </em>{scoreAfter}</span>
            <small>재계산된 과제 접근성 신뢰도</small>
          </p>
        )}
      </div>
      <div className="complete-actions">
        <button type="button" className="button button--primary" onClick={onExport} disabled={!canExport}>
          수정된 과제 내보내기 <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="button button--secondary" onClick={startOver}>새 분석 시작하기</button>
      </div>
      {!canExport && (
        <p className="export-hint">수정된 과제를 사용할 수 없습니다. 학생용 미리보기로 돌아가 다시 작성을 시도하면 내보내기를 사용할 수 있습니다.</p>
      )}
      <p className="educator-note">AccessLens는 과제 수준에서 발생할 수 있는 접근성 장벽을 식별합니다. 최종 판단은 언제나 교사의 몫입니다.</p>
    </main>
  );
}
