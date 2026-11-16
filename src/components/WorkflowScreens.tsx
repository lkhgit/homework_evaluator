"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
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

import JourneyDiagram from "@/components/JourneyDiagram";
import { diffWords, type DiffSegment } from "@/lib/textDiff";
import DemandChips, { chipsForDemands } from "@/components/DemandChips";
import { useWorkflow, useWorkflowSummary, type ConditionId } from "@/components/WorkflowContext";
import { timerPressesOn, type EngineReport } from "@/lib/engine";
import { locateEvidence } from "@/lib/evidenceGuard";
import { documentLanguageFor, speechLanguageFor } from "@/lib/language";
import { keepVisibleTarget } from "@/lib/repairs";
import type { RevisionCheck } from "@/lib/revisionCheck";
import type { StudentHandout } from "@/lib/studentHandout";
import RevisionCheckPanel from "@/components/RevisionCheckPanel";
import StudentHandoutPanel from "@/components/StudentHandoutPanel";
import { REQUEST_LIMITS } from "@/lib/requestLimits";
import { deliverableFor, pdfResultAction } from "@/lib/workflowState";
import { timeConstraintChangesOf } from "@/lib/schemaTypes";
import type { Analysis, FrictionMoment, GoalRelevance, RepairEffects, RevisedAssignment, Step } from "@/lib/schema";

/** A textbook unit opening: the stage's number set large beside its title. */
function ScreenHeading({
  unit,
  title,
  subtitle,
}: {
  unit: number;
  title: string;
  subtitle: string;
}) {
  const summary = useWorkflowSummary();
  return (
    <>
    <div className="screen-heading">
      <span className="unit-number" aria-hidden="true">{String(unit).padStart(2, "0")}</span>
      <div>
        <h1 data-screen-heading tabIndex={-1}>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
    {summary}
    </>
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
  // Text read from a PDF while the educator was editing, held until they
  // choose to use it rather than written over their edits.
  const [pendingPdf, setPendingPdf] = useState<{ name: string; text: string } | null>(null);
  const edits = useRef(0);
  const fileToken = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const overLimit = text.length > REQUEST_LIMITS.assignmentChars;

  function edit(value: string) {
    edits.current++;
    onChange(value);
  }

  function describeExtracted(name: string, extracted: string) {
    const words = extracted.split(/\s+/).length;
    const clipped = extracted.length > REQUEST_LIMITS.assignmentChars
      ? ` 분석 한도(${REQUEST_LIMITS.assignmentChars.toLocaleString("ko-KR")}자)를 넘습니다. 필요한 부분만 남겨 주세요.`
      : " 아래에서 확인한 뒤 분석하세요.";
    return `${name}에서 단어 ${words.toLocaleString("ko-KR")}개를 읽었습니다.${clipped}`;
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const requestToken = ++fileToken.current;
    const editsAtStart = edits.current;
    const settle = () =>
      pdfResultAction({
        requestToken,
        currentToken: fileToken.current,
        mounted: mounted.current,
        editsAtStart,
        editsNow: edits.current,
      });

    setReading(true);
    setFileNote(null);
    setPendingPdf(null);
    try {
      const { extractPdfText } = await import("@/lib/pdfText");
      const extracted = await extractPdfText(file);
      const action = settle();
      if (action === "ignore") return;
      if (action === "offer") {
        setPendingPdf({ name: file.name, text: extracted });
        setFileNote({ tone: "ok", text: `파일을 읽는 사이 내용이 수정되어 ${file.name} 내용으로 바꾸지 않았습니다.` });
        return;
      }
      onChange(extracted);
      setFileNote({ tone: "ok", text: describeExtracted(file.name, extracted) });
    } catch (error) {
      if (settle() === "ignore") return;
      setFileNote({
        tone: "error",
        text: error instanceof Error ? error.message : "이 파일을 읽을 수 없습니다.",
      });
    } finally {
      if (mounted.current && requestToken === fileToken.current) setReading(false);
    }
  }

  function applyPendingPdf() {
    if (!pendingPdf) return;
    edit(pendingPdf.text);
    setFileNote({ tone: "ok", text: describeExtracted(pendingPdf.name, pendingPdf.text) });
    setPendingPdf(null);
  }

  return (
    <main className="workflow-main">
      <ScreenHeading
        unit={1}
        title={hasAnalysis ? "내 과제" : "과제 분석하기"}
        subtitle={
          hasAnalysis
            ? "내용을 고쳐 다시 분석하거나 위 단계에서 결과 화면으로 돌아가세요."
            : "과제를 붙여넣거나 PDF 파일을 올리세요."
        }
      />

      <div className="analysis-grid">
        <section className="document-panel" aria-label="과제 입력">
          {/* Plain buttons: there are no tab panels, and PDF upload opens a file
              dialog that fills the same text box. */}
          <div className="input-tabs" role="group" aria-label="과제 입력 방식">
            <button type="button" aria-pressed="true">
              <FileText size={16} aria-hidden="true" /> 텍스트 붙여넣기
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={reading}
            >
              <Upload size={15} aria-hidden="true" /> {reading ? "PDF 읽는 중…" : "PDF 업로드"}
            </button>
            <button type="button" disabled>
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
          {pendingPdf && (
            <div className="file-pending">
              <button type="button" className="button button--small button--secondary" onClick={applyPendingPdf}>
                PDF 내용으로 바꾸기
              </button>
              <button type="button" className="button button--small button--secondary" onClick={() => setPendingPdf(null)}>
                지금 내용 유지
              </button>
            </div>
          )}
          <label htmlFor="assignment-text" className="sr-only">과제 내용</label>
          <textarea
            id="assignment-text"
            value={text}
            onChange={(event) => edit(event.target.value)}
            spellCheck={false}
            aria-describedby="prototype-note assignment-length"
            aria-invalid={overLimit || undefined}
          />
          <p id="assignment-length" className={`assignment-length${overLimit ? " is-over" : ""}`} aria-live="polite">
            {text.length.toLocaleString("ko-KR")} / {REQUEST_LIMITS.assignmentChars.toLocaleString("ko-KR")}자
            {overLimit && " · 이 길이 안으로 줄여야 분석할 수 있습니다."}
          </p>
          <div className="document-footer">
            <p id="prototype-note">
              {hasAnalysis
                ? "다시 분석하면 지금 결과와 개선안이 새 결과로 바뀝니다."
                : "실시간 분석 · 샘플 과제는 결과가 바로 나옵니다"}
            </p>
            <ArrowButton onClick={onSubmit} disabled={text.trim().length === 0 || reading || overLimit}>
              {hasAnalysis ? "다시 분석" : "분석 시작"}
            </ArrowButton>
          </div>
        </section>

        <aside className="tips-panel" aria-labelledby="tips-title">
          <div className="tips-icon" aria-hidden="true"><Sparkles size={18} /></div>
          <h2 id="tips-title">분석 정확도를 높이려면</h2>
          <ul>
            <li><Check size={15} aria-hidden="true" /> 학생에게 주는 지시문을 빠짐없이 넣으세요</li>
            <li><Check size={15} aria-hidden="true" /> 학습 목표도 함께 적으세요</li>
            <li><Check size={15} aria-hidden="true" /> 과제에 쓰는 링크도 넣으세요</li>
          </ul>
          <div className="tip-note">
            <p>AccessLens가 살펴보는 것</p>
            <span>학생 행동, 도구 전환, 기억 부담, 조작 정밀도, 시간 제한, 응답 방식</span>
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
/**
 * One honest line per phase. The server reports no progress, so the screen
 * shows elapsed time instead of timed messages that would imply it does.
 */
const PHASE_COPY = {
  objective: {
    eyebrow: "과제 읽기",
    title: "과제를 읽고 학습 목표 후보를 찾는 중",
  },
  // The analysis is two requests now: this screen covers the first; repair
  // proposals (2/2) load in the background once the results are on screen.
  analysis: {
    eyebrow: "분석 1/2 · 단계 분석",
    title: "과제를 학생 활동 단위로 나누고 학습 목표와 맞춰 보는 중",
  },
} as const;

export type LoadingPhase = keyof typeof PHASE_COPY;

/** Visual elapsed-time line; deliberately not announced every second. */
export function elapsedLabel(seconds: number): string {
  return `${seconds}초 경과 · 긴 과제는 1–2분 걸릴 수 있습니다`;
}

export function AnalysisLoadingScreen({
  phase = "analysis",
  sample = false,
  onCancel,
}: {
  phase?: LoadingPhase;
  /** The bundled sample is served locally; say so rather than imply a model is working. */
  sample?: boolean;
  onCancel?: () => void;
}) {
  const { eyebrow, title } = PHASE_COPY[phase];
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="loading-screen" aria-busy="true">
      <div className="neural-loader" aria-hidden="true">
        <span />
        <i /><i /><i /><i />
      </div>
      <h1 data-screen-heading tabIndex={-1}>{sample ? "샘플 결과를 불러오는 중" : title}</h1>
      <p className="loading-phase">{eyebrow}</p>
      {!sample && (
        <>
          <p aria-hidden="true">{elapsedLabel(seconds)}</p>
          <p className="sr-only">진행 중입니다. 긴 과제는 1–2분 걸릴 수 있습니다.</p>
        </>
      )}
      {onCancel && (
        <button type="button" className="button button--secondary" onClick={onCancel}>
          취소
        </button>
      )}
    </main>
  );
}

export interface GoalLockScreenProps {
  objective: string;
  onEdit: (objective: string) => void;
  onLock: () => void;
  /** Ask the model again even when a result for this objective exists. */
  onReanalyze?: () => void;
  /** A result for this text and objective is already on screen or remembered. */
  hasResult?: boolean;
}

export function GoalLockScreen({ objective, onEdit, onLock, onReanalyze, hasResult = false }: GoalLockScreenProps) {
  const [editing, setEditing] = useState(false);

  return (
    <main className="workflow-main goal-screen">
      <ScreenHeading
        unit={2}
        title="학습 목표 확정하기"
        subtitle="학생이 실제로 배워야 할 내용을 확인하세요. AccessLens는 개선안을 제안할 때도 이 목표를 바꾸지 않습니다."
      />
      <section className="goal-orbit" aria-labelledby="goal-label">
        <span className="goal-ring goal-ring--one" aria-hidden="true" />
        <span className="goal-ring goal-ring--two" aria-hidden="true" />
        <span className="goal-lock-icon" aria-hidden="true"><LockKeyhole size={21} /></span>
        <div className="goal-content">
          <p className="goal-tag" id="goal-label">학습 목표</p>
          {editing ? (
            <textarea value={objective} onChange={(event) => onEdit(event.target.value)} aria-label="학습 목표" maxLength={REQUEST_LIMITS.objectiveChars} autoFocus />
          ) : (
            <blockquote>“{objective}”</blockquote>
          )}
        </div>
      </section>

      <p className="goal-note">
        개선안은 학생이 과제에 접근하고 배운 것을 보여 주는 방식을 바꿉니다. 배워야 할 내용은 바꾸지 않습니다.
        {hasResult && " 이 목표로 분석한 결과가 이미 있어 바로 보여줍니다."}
      </p>
      <div className="goal-actions">
        <button type="button" className="button button--secondary" onClick={() => setEditing((value) => !value)}>
          <Pencil size={16} aria-hidden="true" /> {editing ? "수정 완료" : "목표 수정"}
        </button>
        <button type="button" className="button button--primary" onClick={() => { setEditing(false); onLock(); }} disabled={!objective.trim()}>
          <LockKeyhole size={16} aria-hidden="true" /> 목표 확정하고 분석
        </button>
        {hasResult && onReanalyze && (
          <button type="button" className="button button--secondary" onClick={() => { setEditing(false); onReanalyze(); }} disabled={!objective.trim()}>
            다시 분석
          </button>
        )}
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

  function affectedStepNumbers(friction: FrictionMoment): string {
    return friction.stepIds
      .map((stepId) => analysis.steps.findIndex((step) => step.id === stepId) + 1)
      .filter((stepNumber) => stepNumber > 0)
      .join(", ");
  }

  return (
    <main className="workflow-main journey-screen">
      <ScreenHeading
        unit={3}
        title="학생이 하는 활동"
        subtitle="과제를 학생이 실제로 하는 활동으로 나눠 어디서 문제가 생기는지 보여 줍니다."
      />
      {/* The same activities as a flow: one lane per tool, so switching tools,
          values carried in memory and running timers show as lines. */}
      <section className="journey-map" aria-labelledby="journey-map-title">
        <h2 id="journey-map-title" className="section-label">활동 흐름 그림 · 칸을 누르면 아래 목록에서 그 활동이 펼쳐집니다</h2>
        <div className="journey-scroll">
          <JourneyDiagram
            analysis={analysis}
            report={report}
            selectedStepId={selectedStepId || undefined}
            frictionByStep={frictionByStep}
            onSelect={(index) => setSelectedStepId(analysis.steps[index]?.id ?? "")}
            nodeLabel={(step) => imperativeAction(step.action)}
            relevanceLabel={RELEVANCE_LABEL}
            severityLabel={SEVERITY_LABEL}
          />
        </div>
      </section>

      <section className="activity-list" aria-labelledby="journey-overview-title">
        <h2 id="journey-overview-title" className="section-label">
          활동 {analysis.steps.length}개 · 활동을 누르면 부담과 문제 지점이 펼쳐집니다
        </h2>
        <ol>
          {analysis.steps.map((step, index) => {
            const frictions = frictionByStep.get(step.id) ?? [];
            const primaryFriction = frictions[0];
            const isSelected = step.id === selectedStepId;
            const detailId = `activity-detail-${step.id}`;
            return (
              <li key={step.id} className={`activity-row${isSelected ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="activity-row__head"
                  onClick={() => setSelectedStepId(isSelected ? "" : step.id)}
                  aria-expanded={isSelected}
                  aria-controls={detailId}
                >
                  <span className="activity-row__num">활동 {index + 1}</span>
                  <span className="activity-row__title">{imperativeAction(step.action)}</span>
                  <span className="activity-row__meta">
                    <span className="activity-row__env"><Link2 size={14} aria-hidden="true" /> {step.environment}</span>
                    <span className={`relevance-pill relevance-${step.goalRelevance}`}>{RELEVANCE_LABEL[step.goalRelevance]}</span>
                    {primaryFriction ? (
                      <span className={`journey-status severity-${primaryFriction.severity}`}>
                        <AlertTriangle size={14} aria-hidden="true" />
                        {SEVERITY_LABEL[primaryFriction.severity]}
                        {frictions.length > 1 && <small>{frictions.length}건</small>}
                      </span>
                    ) : (
                      <span className="journey-status journey-status--clear"><Check size={14} aria-hidden="true" /> 문제 없음</span>
                    )}
                  </span>
                  <ChevronDown className="activity-row__chevron" size={18} aria-hidden="true" />
                </button>
                {isSelected && (
                  <div className="activity-row__detail" id={detailId}>
                    <div className="journey-demand-block">
                      <h3>학생 부담</h3>
                      <DemandChips demands={step.demands} />
                    </div>
                    <div className="journey-friction-detail">
                      {frictions.length > 0 ? (
                        <>
                          <h3 className="section-label">이 활동의 문제 지점</h3>
                          <div className="journey-friction-list">
                            {frictions.map((friction) => (
                              <section key={friction.id} className="journey-friction-card" aria-labelledby={`friction-title-${friction.id}`}>
                                <div className="journey-friction-heading">
                                  <span className={`severity-${friction.severity}`}><AlertTriangle size={14} aria-hidden="true" /> {SEVERITY_LABEL[friction.severity]}</span>
                                  <span>활동 {affectedStepNumbers(friction)}에 영향</span>
                                </div>
                                <h4 id={`friction-title-${friction.id}`}>{friction.title}</h4>
                                <p>{friction.explanation}</p>
                                <button
                                  type="button"
                                  className="button button--secondary button--small"
                                  onClick={() => { selectFriction(friction); goTo("barrier"); }}
                                >
                                  문제 지점 검토하기 <ArrowRight size={15} aria-hidden="true" />
                                </button>
                              </section>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="journey-no-friction">
                          <CheckCircle2 size={18} aria-hidden="true" /> 이 활동에서 찾은 문제 지점이 없습니다.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

export interface BarrierTraceProps {
  assignmentText: string;
  step: Step;
  friction: FrictionMoment;
  citation: string;
  /** When the cited criterion has a recognised exception, e.g. an essential timer. */
  citationNote?: string;
  /** Whether the step's repair addresses this finding's barrier. When false
   *  the repair, if any, belongs to a different barrier and is not offered. */
  repairRelevant: boolean;
  repairs?: RepairsView;
}

function HighlightedEvidence({ assignmentText, evidence }: { assignmentText: string; evidence: string }) {
  // The same whitespace-tolerant match the evidence guard uses to verify the
  // quote. An exact indexOf would fail on a quote that differs only in line
  // wrapping, so a verified quote could pass the check and still not highlight.
  const span = locateEvidence(assignmentText, evidence);
  if (!span) {
    return (
      <>
        <p className="evidence-missing">과제에서 이 활동의 원문을 찾지 못해 강조하지 않았습니다.</p>
        <p className="assignment-copy" lang={documentLanguageFor(assignmentText)}>{assignmentText}</p>
      </>
    );
  }
  return (
    <p className="assignment-copy" lang={documentLanguageFor(assignmentText)}>
      {assignmentText.slice(0, span.start)}
      <mark>{assignmentText.slice(span.start, span.end)}</mark>
      {assignmentText.slice(span.end)}
    </p>
  );
}

const BARRIER_CATEGORY_LABEL: Record<string, string> = {
  working_memory: "기억력",
  context_switching: "도구 전환",
  fine_motor: "정밀한 손 조작",
  time_pressure: "시간 압박",
  reading_load: "읽기 부담",
  single_modality_communication: "단일 응답 방식",
  sensory_color_only: "색상 단독 단서",
  sensory_audio_only: "소리 단독 단서",
  navigation_ambiguity: "불명확한 탐색",
};

export function BarrierTrace({ assignmentText, step, friction, citation, citationNote, repairRelevant, repairs = READY_REPAIRS }: BarrierTraceProps) {
  const repairsReady = repairs.state === "ready";
  const offered = repairsReady && repairRelevant ? step.repair : null;
  const { goTo, applyRepair } = useWorkflow();
  const category = BARRIER_CATEGORY_LABEL[friction.barrierType] ?? friction.barrierType.replaceAll("_", " ");
  return (
    <main className="workflow-main">
      <ScreenHeading unit={4} title="문제 자세히 보기" subtitle="학생을 막는 지점과 그 이유를 확인하세요." />
      <div className="barrier-grid">
        <section className="excerpt-panel" aria-labelledby="excerpt-title">
          <div className="document-masthead">
            <p id="excerpt-title">과제 원문</p>
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
            <div><dt>발견 근거</dt><dd>{friction.explanation}</dd></div>
            <div><dt>중요한 이유</dt><dd>{step.relevanceReason}</dd></div>
            <div><dt>학습 목표와 관련성</dt><dd className="goal-relevance-value">{RELEVANCE_LABEL[step.goalRelevance]}</dd></div>
            <div><dt>개선안</dt><dd>{repairsReady ? (offered?.suggestion ?? "이 문제 지점을 직접 해결하는 개선안은 없습니다. 활동 목록 화면에서 이 단계를 다시 살펴보세요.") : <RepairsPending repairs={repairs} />}</dd></div>
          </dl>
          <p className="citation"><BookOpen size={15} aria-hidden="true" /> {citation}</p>
          {citationNote && <p className="citation-note">{citationNote}</p>}
          <div className="barrier-actions">
            <button type="button" className="button button--secondary" onClick={() => goTo("journey")}><ArrowLeft size={16} aria-hidden="true" /> 활동 목록으로 돌아가기</button>
            {offered !== null ? (
              <button type="button" className="button button--primary" onClick={() => { applyRepair(step.id); goTo("repair"); }}><Check size={16} aria-hidden="true" /> 개선안 채택</button>
            ) : (
              <button type="button" className="button button--primary" onClick={() => goTo("repair")}>개선 계획 보기 <ChevronRight size={16} aria-hidden="true" /></button>
            )}
            <button type="button" className="button button--secondary" onClick={() => goTo("preview")}>학생용 미리보기 <ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </article>
      </div>
    </main>
  );
}

/** Where the background repair pass stands for the analysis on screen. */
export interface RepairsView {
  state: "loading" | "ready" | "failed";
  message: string;
  onRetry: () => void;
}

const READY_REPAIRS: RepairsView = { state: "ready", message: "", onRetry: () => undefined };

/** Shown while proposals are pending or after they failed, never in place of real ones. */
function RepairsPending({ repairs }: { repairs: RepairsView }) {
  if (repairs.state === "loading") {
    return (
      <p className="repairs-pending" role="status">
        분석 2/2 · 개선안을 만드는 중입니다. 측정 결과는 지금 볼 수 있습니다.
      </p>
    );
  }
  if (repairs.state === "failed") {
    return (
      <div className="repairs-pending repairs-pending--failed" role="alert">
        <p>{repairs.message || "개선안을 만들지 못했습니다."}</p>
        <button type="button" className="button button--small button--secondary" onClick={repairs.onRetry}>
          다시 시도
        </button>
      </div>
    );
  }
  return null;
}

export interface RepairScreenProps {
  steps: Step[];
  /** Repairs already accepted elsewhere — the Barrier Trace has its own Apply
   *  button, and arriving here to be told nothing was applied would be wrong. */
  appliedRepairIds: string[];
  onApply: (stepId: string) => void;
  onKeep: (stepId: string) => void;
  onCustomize: (stepId: string, suggestion: string) => Promise<void>;
  /** Proposals arrive after the graph; until then the list is not "empty". */
  repairs?: RepairsView;
}

export function effectLabels(effects: RepairEffects, step?: Step): string[] {
  const labels: string[] = [];
  if (effects.keepsInfoVisible) {
    const target = step ? keepVisibleTarget(step) : "producer";
    labels.push(
      target === "producer"
        ? "이 단계에서 얻은 정보를 다음 단계에서도 계속 표시"
        : target === "consumer"
          ? "앞 단계에서 얻은 값을 이 단계 화면에 표시 (이 단계에만 적용)"
          : "정보 표시 효과 없음 (이 단계는 정보를 만들거나 쓰지 않음)",
    );
  }
  if (effects.reducesWorkingMemory) labels.push("기억 부담 감소");
  if (effects.reducesFineMotor) labels.push("손 조작 부담 감소");
  if (effects.reducesReadingLoad) labels.push("읽기 부담 감소");
  if (effects.addsNonColorCue) labels.push("색상 외 단서 추가");
  if (effects.addsCaptionOrTranscript) labels.push("자막 또는 스크립트 추가");
  if (effects.addsResponseAlternative) labels.push("응답 방식 선택지 추가");
  if (effects.replacementEnvironment) {
    labels.push(`이 단계를 ${effects.replacementEnvironment}에서 하도록 변경`);
  }
  for (const change of timeConstraintChangesOf(effects)) {
    labels.push(
      change.action === "remove"
        ? `타이머 ${change.constraintId} 제거`
        : `타이머 ${change.constraintId} 제한을 ${change.limitMinutes}분으로 변경`,
    );
  }
  return labels.length > 0 ? labels : ["규칙으로 측정되는 변화 없음"];
}

export function RepairScreen({ steps, appliedRepairIds, onApply, onKeep, onCustomize, repairs = READY_REPAIRS }: RepairScreenProps) {
  const repairsReady = repairs.state === "ready";
  const { goTo } = useWorkflow();
  const repairSteps = steps.filter((step) => step.repair !== null);
  const [decisions, setDecisions] = useState<Record<string, "apply" | "keep" | "custom">>(
    () => Object.fromEntries(
      appliedRepairIds
        .filter((id) => repairSteps.some((step) => step.id === id))
        .map((id) => [id, "apply" as const]),
    ),
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
      setCustomError("개선안 내용을 모두 채운 뒤 저장하세요.");
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
        error instanceof Error ? error.message : "개선안을 확인하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const reviewed = Object.keys(decisions).length;
  const ready = Object.values(decisions).filter((decision) => decision !== "keep").length;

  return (
    <main className="workflow-main repair-screen">
      <ScreenHeading unit={5} title="개선 계획" subtitle="학습 목표는 그대로 두고 개선안을 하나씩 검토하세요." />
      <RepairsPending repairs={repairs} />
      {repairsReady && repairSteps.length === 0 && (
        <section className="repair-empty" aria-live="polite">
          <p>
            검토할 개선안이 없습니다. 원본 과제 그대로 검증으로 넘어갈 수 있습니다.
          </p>
        </section>
      )}
      <div className="repair-list">
        {repairSteps.map((step) => {
          const decision = decisions[step.id];
          const demands = chipsForDemands(step.demands);
          const highDemand = Math.max(step.demands.workingMemory, step.demands.fineMotor, step.demands.timePressure) >= 3;
          return (
            <article key={step.id} className={`repair-row ${decision === "apply" || decision === "custom" ? "is-accepted" : ""}`}>
              <div className="repair-index">활동 {steps.findIndex((candidate) => candidate.id === step.id) + 1}</div>
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
                  {effectLabels(step.repair!.effects, step).map((effect) => <li key={effect}>{effect}</li>)}
                </ul>
                {editingId === step.id && (
                  <div className="customize-field">
                    <label htmlFor={`custom-${step.id}`}>개선안 직접 고치기</label>
                    <textarea id={`custom-${step.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
                    <p>직접 쓴 내용은 다시 분류한 뒤 측정에 반영합니다.</p>
                    {customError && <p role="alert" className="customize-error">{customError}</p>}
                    <button type="button" className="button button--small button--primary" onClick={() => saveCustomize(step.id)} disabled={savingId === step.id || draft.trim().length === 0}>
                      {savingId === step.id ? "확인 중…" : "저장하고 채택"}
                    </button>
                  </div>
                )}
                <div className="rigor-note">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <p><strong>난이도 {step.repair!.rigorPreserved ? "유지됨" : "검토 필요"}</strong><span>{step.repair!.rigorNote}</span></p>
                </div>
                <div className="repair-row-actions" aria-label={`${step.repair!.barrierReduced} 결정`}>
                  <button type="button" className={decision === "apply" ? "is-selected" : ""} onClick={() => choose(step.id, "apply")}><Check size={14} aria-hidden="true" /> 채택</button>
                  <button type="button" onClick={() => beginCustomize(step)}><Pencil size={14} aria-hidden="true" /> 직접 수정</button>
                  <button type="button" className={decision === "keep" ? "is-selected" : ""} onClick={() => choose(step.id, "keep")}>그대로 두기</button>
                </div>
                {demands.length > 0 && <p className="repair-demand-note">{demands.map((demand) => demand.label).join(", ")}에서 감지됨.</p>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="sticky-action-bar">
        <p>문제 지점 {repairSteps.length}개 중 <strong>{reviewed}</strong>개 검토 <span aria-hidden="true">·</span> 개선안 <strong>{ready}</strong>개 준비</p>
        <button type="button" className="button button--secondary" onClick={() => goTo("barrier")}><ArrowLeft size={16} aria-hidden="true" /> 문제 지점으로 돌아가기</button>
        <button type="button" className="button button--secondary" onClick={() => goTo("preview")} disabled={!repairsReady || (repairSteps.length > 0 && reviewed === 0)}>
          학생용 미리보기로 바로 가기
        </button>
        <ArrowButton onClick={() => goTo("constraint")} disabled={!repairsReady || (repairSteps.length > 0 && reviewed === 0)}>검증으로 계속</ArrowButton>
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

/** The processing-time condition is the shared timer rule, nothing else. */
export function processingTimeFails(step: Step, timing: EngineReport["timing"]): boolean {
  return timerPressesOn(step, timing);
}

export const CONDITIONS: ConditionDefinition[] = [
  {
    id: "working_memory",
    label: "기억력 제한",
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
      "마우스 없이 각 단계를 마칠 수 있는지는 소프트웨어마다 달라 과제 지문만으로는 알 수 없습니다. 정밀한 손 조작은 '정밀한 손 조작이 어려움'에서 따로 측정합니다.",
  },
  { id: "fine_motor", label: "손 조작 제한", icon: MousePointer2, fails: (step) => step.demands.fineMotor >= 2 },
  { id: "no_spoken", label: "말하기 응답 불가", icon: Mic, fails: (step) => step.demands.communication === "spoken" },
  { id: "no_audio", label: "소리 없이", icon: Volume2, fails: (step) => step.demands.sensory.audioOnly },
  { id: "no_color", label: "색상 정보 없이", icon: Sparkles, fails: (step) => step.demands.sensory.colorOnly },
  {
    id: "processing_time",
    label: "추가 처리 시간 필요",
    icon: Clock3,
    // The same rule finding resolution and timer relaxation use (see
    // timerPressesOn), so this test and the repair verdicts always agree.
    fails: (step, { timing }) => processingTimeFails(step, timing),
  },
  {
    id: "reduced_motion",
    label: "움직임 최소화",
    icon: RotateCcw,
    fails: () => false,
    unavailable: true,
    unavailableReason:
      "분석 항목에 움직임과 애니메이션이 없어 결과를 추측해 채우지 않습니다.",
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
      <ScreenHeading unit={6} title="검증 (선택)" subtitle="접근 조건마다 과제가 어디서 막히는지 확인하세요." />
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
            <div><h2 id="results-title">{selected.label} · 활동별 결과</h2></div>
            {!unavailable && (
              <span>
                {fixedCount > 0
                  ? `전체 ${analysis.steps.length}단계 중 ${stillFailing.length}단계 실패 · 개선안으로 ${fixedCount}단계 해결됨`
                  : `전체 ${analysis.steps.length}단계 중 ${failedSteps.length}단계 실패`}
              </span>
            )}
          </div>
          {unavailable ? (
            <div className="unavailable-state"><selected.icon size={24} aria-hidden="true" /><h3>과제 데이터로 알 수 없음</h3><p>{selected.unavailableReason}</p></div>
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
              <h3>실패하는 이유: {focusedStep.action}</h3>
              <p>{focusedStep.relevanceReason}</p>
              {focusedFixed && focusedStep.repair ? (
                <span>
                  <CheckCircle2 size={15} aria-hidden="true" /> 채택한 개선안이 이 단계에서 이 조건을 해결합니다
                </span>
              ) : <span>채택한 개선안 중 이 조건을 바꾸는 것이 없습니다.</span>}
            </article>
          )}
        </section>

        <aside className="condition-preview" aria-labelledby="preview-title">
          <h2 id="preview-title">{focusedStep.action}</h2>
          {focusedFixed && focusedStep.repair ? (
            <><div className="preview-results"><p>개선안</p><strong>{focusedStep.repair.suggestion}</strong></div><ul className="preview-assurance" aria-label="채택한 개선안에 적힌 효과">{effectLabels(focusedStep.repair.effects, focusedStep).map((label) => <li key={label}><Check size={14} aria-hidden="true" /> {label}</li>)}</ul></>
          ) : (
            <p className="preview-empty">이 조건에서 이 단계에 제안된 변경이 없습니다.</p>
          )}
          <dl className="compact-metrics"><div><dt>과제 환경 수</dt><dd>{report.switching.uniqueEnvironments.length}{repairedReport.switching.uniqueEnvironments.length !== report.switching.uniqueEnvironments.length ? ` → ${repairedReport.switching.uniqueEnvironments.length}` : ""}</dd></div><div><dt>활성 타이머</dt><dd>{report.timing.constraints.length || "없음"}{repairedReport.timing.constraints.length !== report.timing.constraints.length ? ` → ${repairedReport.timing.constraints.length || "없음"}` : ""}</dd></div></dl>
        </aside>
      </div>
      <div className="screen-footer-actions"><button type="button" className="button button--secondary" onClick={() => goTo("repair")}><ArrowLeft size={16} aria-hidden="true" /> 개선안으로 돌아가기</button><button type="button" className="button button--secondary" onClick={() => selectCondition(CONDITIONS[0].id)}>다른 조건 보기</button><ArrowButton onClick={() => goTo("preview")}>계속하기</ArrowButton></div>
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
  /** The rewrite failure for the current key, if any. */
  previewFailure: string;
  /** Asks the page for the rewrite; the page reuses a request already running. */
  onRequestPreview: () => void;
  timeConstraints: Analysis["timeConstraints"];
  /** The step-by-step student guide for the current rewrite, if any. */
  guide?: { html: string; filename: string } | null;
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

export function StudentPreview({ objective, steps, appliedRepairIds, assignmentText, existingRevision, previewFailure, onRequestPreview, timeConstraints, guide = null }: StudentPreviewProps) {
  const { goTo } = useWorkflow();
  const [tools, setTools] = useState<Record<string, boolean>>({ spacing: false, declutter: false, readAloud: false });
  // The page holds the rewrite against the inputs it was generated from, so a
  // changed repair decision retires it, and owns the request itself.
  const revised = existingRevision;
  const message = previewFailure;
  const deliverable = useMemo(
    () =>
      deliverableFor({
        originalText: assignmentText,
        objective,
        acceptedSteps: steps.filter((step) => appliedRepairIds.includes(step.id)),
        revision: revised,
        timeConstraints,
      }),
    [assignmentText, objective, steps, appliedRepairIds, revised, timeConstraints],
  );

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

  // Asking is idempotent: the page reuses a request already in flight.
  useEffect(() => {
    if (accepted.length === 0 || revised !== null || message !== "") return;
    onRequestPreview();
  }, [accepted.length, revised, message, onRequestPreview]);

  const loading = accepted.length > 0 && revised === null && message === "";
  // Word-level comparison, shown only beside an actual AI rewrite.
  const diff = useMemo(
    () => (revised && accepted.length > 0 ? diffWords(assignmentText, revised.revisedText) : null),
    [assignmentText, revised, accepted.length],
  );

  function retryRewrite() {
    onRequestPreview();
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
    // Without a language many browsers read Korean with an English voice.
    utterance.lang = speechLanguageFor(revised.revisedText);
    utterance.rate = 0.95;
    speech.speak(utterance);
    return () => speech.cancel();
  }, [tools.readAloud, revised]);

  return (
    <main className="workflow-main student-preview-screen">
      <ScreenHeading unit={7} title="학생용 미리보기" subtitle="배울 내용은 그대로 두고 과정을 더 수월하게 만듭니다." />

      <section
        className={`revision-compare${tools.spacing ? " is-spaced" : ""}${tools.declutter ? " is-decluttered" : ""}`}
        aria-label="원본과 AI 수정본"
      >
        <article className="student-assignment">
          <header><p>원본</p><span>지금 학생이 받는 과제</span></header>
          <section className="student-goal"><p className="goal-tag">학습 목표</p><h2 lang={documentLanguageFor(objective)}>{objective}</h2></section>
          <pre className="assignment-body" lang={documentLanguageFor(assignmentText)}>{renderDiff(diff?.original, assignmentText, "removed")}</pre>
        </article>

        <article className="student-assignment student-assignment--revised">
          <header>
            <p>{accepted.length === 0 ? "변경 없음" : "AI 수정본"}</p>
            <span>
              {accepted.length === 0
                ? "채택된 개선안이 없어 원본을 그대로 유지합니다"
                : revised
                  ? `${revised.title} · 채택한 개선안을 반영해 AI가 다시 작성함`
                  : "채택한 개선안을 반영해 AI가 다시 씁니다"}
            </span>
          </header>
          <section className="student-goal"><p className="goal-tag">학습 목표</p><h2 lang={documentLanguageFor(objective)}>{objective}</h2></section>

          {accepted.length === 0 && (
            <p className="revision-empty">
              채택한 개선안이 없어 과제를 다시 쓰지 않았습니다. 학생은 왼쪽 원본을
              그대로 받고 완료 화면에서 원본을 내보낼 수 있습니다. 개선안을 채택하려면
              개선 계획 화면으로 돌아가세요.
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

          {revised && accepted.length > 0 && (
            <>
              <p className="revision-note">
                AI가 쓴 문장입니다. 학생에게 나눠 주기 전에 직접 확인하세요.
              </p>
              {diff && (
                <p className="revision-legend">
                  <mark className="revision-added">색칠된 부분</mark>은 원본에서 바뀐 곳이고, 원본 쪽의 <mark className="revision-removed">줄 그은 부분</mark>은 빠지거나 바뀐 곳입니다.
                </p>
              )}
              <pre className="assignment-body" lang={documentLanguageFor(revised.revisedText)}>{renderDiff(diff?.revised, revised.revisedText, "added")}</pre>
            </>
          )}
        </article>
      </section>

      {revised && accepted.length > 0 && revised.changes.length > 0 && (
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

      {deliverable?.check && <RevisionCheckPanel check={deliverable.check} />}
      {deliverable && <StudentHandoutPanel handout={deliverable.handout} unchanged={deliverable.kind === "original"} guide={guide} />}

      <div className="student-layout">
        <aside className="access-tools" aria-labelledby="tools-title">
          <h2 id="tools-title">접근성 도구</h2>
          <p>학생 화면에서 과제가 보이는 방식을 바꿔 보세요.</p>
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
          <button type="button" className="button button--secondary" onClick={() => goTo("complete")}>AI 수정본 없이 마치기</button>
        ) : (
          <ArrowButton onClick={() => goTo("complete")} disabled={loading}>
            {loading ? "수정본 작성 중…" : "분석 마치기"}
          </ArrowButton>
        )}
      </div>
    </main>
  );
}

export interface CompleteScreenProps {
  frictionCount: number;
  /** Findings whose measured condition disappears once the accepted repairs'
   *  declared effects are applied to the task graph. A projection: the
   *  rewritten text itself is not re-analysed. */
  frictionResolved: number;
  frictionUnverified: number;
  repairsApplied: number;
  /** The model's own judgement for every accepted repair, for the educator to confirm. */
  goalPreserved: boolean;
  onExport: () => void;
  /** What can be exported: the AI rewrite, the unchanged original, or nothing
   *  (repairs were accepted but no rewrite exists yet). */
  exportKind: "revised" | "original" | null;
  scoreBefore: number;
  scoreAfter: number;
  /** The student's copy, when there is something to hand out. */
  handout?: StudentHandout | null;
  /** Local text comparison of the rewrite, when there is one. */
  revisionCheck?: RevisionCheck | null;
  /** The step-by-step student guide for the current rewrite, if any. */
  guide?: { html: string; filename: string } | null;
}

/**
 * How the friction score moved, named plainly whichever way it went. A higher
 * score means less measured friction, so the direction is spelled out rather
 * than left to "상승", which reads as friction going up.
 */
export function scoreChangeLabel(before: number, after: number): string {
  if (after > before) return `${after - before}점 개선 · 측정된 문제 감소`;
  if (after < before) return `${before - after}점 악화 · 측정된 문제 증가`;
  return "변화 없음";
}

/** The completion sentence. Kept separate so each case can be tested. */
export function completionSummary({
  frictionCount,
  frictionResolved,
  frictionUnverified,
  repairsApplied,
  exportKind,
}: Pick<CompleteScreenProps, "frictionCount" | "frictionResolved" | "frictionUnverified" | "repairsApplied" | "exportKind">): string {
  if (repairsApplied === 0) {
    return frictionCount === 0
      ? "측정된 문제 지점이 없습니다. 원본 과제를 그대로 두었습니다."
      : `채택한 개선안이 없어 원본 과제를 그대로 두었습니다. 측정된 문제 지점 ${frictionCount}개가 남아 있습니다.`;
  }
  const prefix = exportKind === null
    ? "채택 결정은 저장했지만 AI 수정본을 만들지 못해 내보낼 수 없습니다. "
    : "";
  if (frictionCount === 0) {
    return `${prefix}처음부터 측정된 문제 지점이 없어 채택한 개선안 ${repairsApplied}개로 해소된 항목은 없습니다.`;
  }
  const unresolved = frictionCount - frictionResolved - frictionUnverified;
  if (frictionResolved === frictionCount) {
    return `${prefix}채택한 개선안에 적힌 효과를 단계 분석에 반영하면 문제 지점 ${frictionCount}개가 모두 해소되는 것으로 계산됩니다. AI 수정본 문장을 다시 측정한 결과는 아닙니다.`;
  }
  const unverified = frictionUnverified > 0
    ? ` 과제 데이터로 결과를 확인할 수 없는 항목은 ${frictionUnverified}개입니다.`
    : "";
  return `${prefix}채택한 개선안에 적힌 효과 기준으로 다시 계산했습니다. 계산상 문제 지점 ${frictionCount}개 중 ${frictionResolved}개가 해소되고 ${unresolved}개가 남습니다.${unverified}`;
}

export function CompleteScreen({ frictionCount, frictionResolved, frictionUnverified, repairsApplied, goalPreserved, onExport, exportKind, scoreBefore, scoreAfter, handout = null, revisionCheck = null, guide = null }: CompleteScreenProps) {
  const { startOver } = useWorkflow();
  const summary = completionSummary({ frictionCount, frictionResolved, frictionUnverified, repairsApplied, exportKind });
  const heading = exportKind === "revised"
    ? "AI 수정본이 준비되었습니다."
    : exportKind === "original"
      ? "원본 과제를 그대로 유지합니다."
      : "분석을 마쳤습니다.";
  const goalFact = repairsApplied === 0
    ? "학습 목표 변경 없음"
    : goalPreserved
      ? "학습 목표 유지 (모델 판단 · 교사 확인 필요)"
      : "학습 목표 검토 필요 (모델 판단)";
  return (
    <main className="complete-screen">
      <span className="unit-number" aria-hidden="true">08</span>
      <h1 data-screen-heading tabIndex={-1}>{heading}</h1>
      <p className="complete-intro">{summary}</p>
      <div className="completion-facts">
        <p><CheckCircle2 size={18} aria-hidden="true" /><span>{goalFact}</span></p>
        <p><span>{frictionResolved}<em> / </em>{frictionCount}</span><small>문제 지점 해소 (개선안에 적힌 효과 기준)</small></p>
        {frictionUnverified > 0 && <p><span>{frictionUnverified}</span><small>결과 확인 불가</small></p>}
        <p><span>{repairsApplied}</span><small>채택한 개선안</small></p>
        {/* Always shown: hiding an unchanged or lower score would report only
            the outcomes that flatter the repairs. */}
        <p className="complete-delta">
          <span>{scoreBefore}<em> → </em>{scoreAfter}</span>
          <small>접근성 점수 · 높을수록 문제 적음 ({scoreChangeLabel(scoreBefore, scoreAfter)}, 개선안에 적힌 효과 기준)</small>
        </p>
      </div>
      <div className="complete-actions">
        <button type="button" className="button button--primary" onClick={onExport} disabled={exportKind === null}>
          교사용 분석 리포트 내보내기 <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="button button--secondary" onClick={startOver}>새로 분석하기</button>
      </div>
      <p className="export-kind-note">
        {exportKind === "original"
          ? "리포트에는 변경 없는 원본 과제와 측정값이 담깁니다."
          : exportKind === "revised"
            ? "리포트에는 AI 수정본, 문장 점검, 측정값이 담깁니다. 학생에게는 아래 학생용 활동지를 주세요."
            : ""}
      </p>
      {revisionCheck && <RevisionCheckPanel check={revisionCheck} />}
      {handout && (
        <StudentHandoutPanel handout={handout} unchanged={exportKind === "original"} compact guide={guide} />
      )}
      {exportKind === null && (
        <p className="export-hint">AI 수정본이 없습니다. 학생용 미리보기로 돌아가 다시 시도하면 내보낼 수 있습니다.</p>
      )}
      <p className="educator-note">AccessLens는 과제에서 생길 수 있는 접근성 문제를 찾습니다. 해소 여부는 개선안에 적힌 효과로 계산한 추정이며 최종 판단은 교사가 합니다.</p>
    </main>
  );
}
