"use client";

import Link from "next/link";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import { useEffect, useRef, useState } from "react";
import type { StudentAnalysis } from "@/lib/studentAnalysis";
import { readStored, writeStored } from "@/lib/browserStore";
import { ArrowLeft, FileText, Upload, X, ArrowRight, LoaderCircle } from "lucide-react";
import { activityParagraphs } from "@/lib/activityParagraphs";
import { BIOLOGY_TEXT } from "@/samples/biology";
import ErrorBanner from "@/components/ErrorBanner";
import StudentFlow from "@/components/StudentFlow";

type Reference = { title: string; url: string };
export default function StudentPage() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<StudentAnalysis | null>(null);
  const [error, setError] = useState("");
  const [hiddenWarnings, setHiddenWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [references, setReferences] = useState<Record<number, Reference[]>>({});
  const [searching, setSearching] = useState<number | null>(null);
  const generation = useRef(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedStep, setSelectedStep] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (result && !editing) resultHeading.current?.focus(); }, [result, editing]);
  useEffect(() => {
    let active = true;
    readStored<{ text: string; files: File[]; result: StudentAnalysis | null }>("student-current")
      .then(saved => { if (active && saved) { setText(saved.text); setFiles(saved.files); setResult(saved.result); } })
      .catch(() => { if (active) setError("저장된 자료를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => { writeStored("student-current", { text, files, result }).catch(() => setError("자료를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.")); }, 500);
    return () => window.clearTimeout(timer);
  }, [loaded, text, files, result]);
  useEffect(() => {
    const entries = files.map(file => [file.name, URL.createObjectURL(file)] as const);
    const timer = window.setTimeout(() => setUrls(Object.fromEntries(entries)), 0);
    return () => { window.clearTimeout(timer); entries.forEach(([, url]) => URL.revokeObjectURL(url)); };
  }, [files]);

  async function analyze() {
    const id = ++generation.current;
    setHiddenWarnings([]);
    setError(""); setBusy(true); setResult(null); setReferences({}); setSearching(null);
    const body = new FormData(); body.append("text", text);
    files.forEach(file => body.append("files", file));
    try {
      const response = await fetch("/api/student", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "분석에 실패했습니다.");
      if (id === generation.current) { setResult(data); setEditing(false); setSelectedStep(0); }
    } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "분석에 실패했습니다."); }
    finally { if (id === generation.current) setBusy(false); }
  }
  async function search(index: number) {
    if (!result || searching !== null || references[index]?.length) return;
    const step = result.steps[index];
    const terms = step.terms.map(({ term }) => term.trim().slice(0, 60)).filter(Boolean).slice(0, 4);
    const query = [
      `과제: ${result.title.trim().slice(0, 200)}`,
      `활동: ${step.action.trim().slice(0, 500)}`,
      ...(terms.length ? [`관련 용어: ${terms.join(", ")}`] : []),
    ].join("\n");
    const id = generation.current;
    setSearching(index); setError("");
    try {
      const response = await fetch("/api/references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");
      if (id === generation.current) setReferences(current => ({ ...current, [index]: data.links }));
    } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "검색에 실패했습니다."); }
    finally { if (id === generation.current) setSearching(null); }
  }
  function selectStep(index: number) {
    setSelectedStep(index);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("#student-step-detail h2")?.focus());
  }
  return <><WorkspaceHeader mode="student" /><main className="student-page" id="main-content">
    {(!result || editing) && <><div className="screen-heading"><h1>내 과제 시작하기</h1><p>받은 지침을 넣어 주세요. 준비물부터 제출까지 해야 할 일을 정리합니다.</p></div>
    <section className="student-input" aria-label="과제 자료 입력" aria-busy={busy}>
    <div className="input-toolbar"><h2>과제 지침</h2><div><button type="button" className="text-button" disabled={busy || !loaded} onClick={() => { if ((text.trim() || files.length) && !window.confirm("현재 입력과 첨부 파일을 확산 실험 예시로 바꿀까요?")) return; setText(BIOLOGY_TEXT); setFiles([]); setResult(null); setReferences({}); setError(""); }}>예시 적용</button><button type="button" className="button button--secondary" disabled={busy || !loaded} onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true" /> 파일 추가</button></div></div>
    <input ref={fileInput} hidden id="student-files" type="file" accept=".pdf,application/pdf,image/png,image/jpeg" multiple disabled={busy || !loaded} onChange={e => {
      const added = Array.from(e.target.files ?? []); e.target.value = "";
      if (added.some(file => file.size > 8_000_000) || [...files, ...added].reduce((total, file) => total + file.size, 0) > 11_500_000) { setError("파일당 8MB, 전체 약 11MB까지 추가할 수 있습니다. 파일 크기를 줄여 주세요."); return; }
      if (files.length + added.length > 8 || new Set([...files, ...added].map(f => f.name)).size !== files.length + added.length) { setError("파일은 최대 8개이며 이름이 서로 달라야 합니다."); return; }
      setFiles(current => [...current, ...added]); setResult(null); setError(""); setSelectedStep(0);
    }} />
    <ul className="uploaded-files">{files.map((file, i) => <li key={file.name}><FileText size={18} aria-hidden="true" /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" aria-label={`${file.name} 삭제`} disabled={busy} onClick={() => { setFiles(current => current.filter((_, at) => at !== i)); setResult(null); }}><X size={17} aria-hidden="true" /></button></li>)}</ul>
    <div className="student-input-body"><label htmlFor="student-text">과제 내용</label><p className="field-help" id="student-file-help">PDF, PNG, JPG 파일을 최대 8개 추가할 수 있습니다. 파일당 8MB, 전체 약 11MB까지 지원합니다.</p>
    <textarea aria-describedby="student-file-help" id="student-text" value={text} disabled={busy || !loaded} maxLength={80000} placeholder="받은 지시문을 붙여넣으세요. 파일만 추가해도 됩니다." onChange={e => { setText(e.target.value); setResult(null); }} rows={8} /></div>
    <p className="data-notice">분석할 때 첨부 파일과 입력한 글이 외부 AI로 전송됩니다. 이름과 학번 등 불필요한 개인정보는 지워 주세요. <Link href="/guide">자료 처리 안내</Link></p>
    <div className="student-input-footer"><p>{busy ? "완료되면 수행 안내가 열립니다." : "파일과 글을 함께 넣어도 됩니다."}</p><button type="button" className="button button--primary" aria-busy={busy} disabled={busy || !loaded || (!text.trim() && !files.length)} onClick={analyze}>{busy ? <><LoaderCircle className="loading-spinner" size={18} aria-hidden="true" />자료 읽는 중…</> : <>할 일 정리하기<ArrowRight size={17} aria-hidden="true" /></>}</button></div>
    </section>
    {busy && <div className="request-status" role="status"><LoaderCircle className="loading-spinner" size={28} aria-hidden="true" /><div><strong>자료를 읽고 있습니다</strong><p>해야 할 일과 제출 조건을 정리하고 있습니다. 파일이 많으면 시간이 더 걸립니다.</p></div></div>}
    </>}
    {editing && result && <button type="button" className="button button--secondary" onClick={() => setEditing(false)}>기존 안내로 돌아가기</button>}
    {error && <ErrorBanner message={error} />}
    {result && !editing && <article className="student-guide">
      <div className="guide-heading"><div><h1 ref={resultHeading} tabIndex={-1}>{result.title}</h1><p>해야 할 일 {result.steps.length}단계와 제출 조건을 확인하세요.</p></div><button type="button" className="button button--secondary" onClick={() => setEditing(true)}>자료 수정</button></div>
      <StudentFlow steps={result.steps} selected={selectedStep} onSelect={selectStep} />
      {result.conflicts.length > 0 && !hiddenWarnings.includes("conflicts") && <section role="alert" className="student-warning"><div className="teacher-analysis-warning__heading"><h2>확인이 필요한 지침 충돌</h2><button type="button" aria-label="지침 충돌 경고 닫기" onClick={() => setHiddenWarnings(current => [...current, "conflicts"])}><X size={20} aria-hidden="true" /></button></div>{result.conflicts.map((c, i) => <div key={i}><p>{c.description}</p><Sources sources={c.sources} urls={urls} /></div>)}</section>}
      {result.warnings.length > 0 && !hiddenWarnings.includes("warnings") && <section role="alert" className="student-warning"><div className="teacher-analysis-warning__heading"><h2>원본 확인 필요</h2><button type="button" aria-label="원본 확인 경고 닫기" onClick={() => setHiddenWarnings(current => [...current, "warnings"])}><X size={20} aria-hidden="true" /></button></div><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></section>}
      <div id="student-step-detail" aria-live="polite" aria-atomic="false">
      {result.steps.map((step, i) => selectedStep === i && <section className="student-step" key={i}>
        <div className="step-heading"><span>{String(i + 1).padStart(2, "0")}</span><h2 tabIndex={-1}>{step.action}</h2></div>
        {step.sources.some(source => source.quote.trim()) && <div className="student-activity"><h3>활동 안내</h3>{[...new Set(step.sources.flatMap(source => activityParagraphs(source.quote)))].map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div>}
        <details className="student-support-details"><summary>준비물과 주의사항</summary>
        <dl><dt>준비물</dt><dd>{step.materials || "지침에 명시되지 않음"}</dd><dt>완료 확인</dt><dd>{step.completion || "지침에 명시되지 않음"}</dd><dt>기록과 주의사항</dt><dd>{step.caution || "지침에 명시되지 않음"}</dd><dt>어려울 수 있는 부분</dt><dd>{step.difficulties || "지침에 명시되지 않음"}</dd></dl></details>
        <details className="source-disclosure"><summary>원문과 수행 조건 확인</summary><Sources sources={step.sources} urls={urls} /></details>
        {step.terms.length > 0 && <div>용어: {step.terms.map((term, j) => <details className="term" key={j} onMouseEnter={event => { event.currentTarget.open = true; }} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) event.currentTarget.open = false; }}><summary>{term.term}</summary><p>{term.meaning}</p></details>)}</div>}
        {!references[i]?.length && <button type="button" className="button button--secondary" disabled={searching !== null} onClick={() => search(i)}>{searching === i ? "검색 중…" : references[i] ? "참고 자료 다시 찾기" : "참고 자료 찾기"}</button>}
        {references[i] && (references[i].length ? <ul>{references[i].map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title || link.url}</a></li>)}</ul> : searching !== i && <p>이 단계의 참고 자료를 찾지 못했습니다.</p>)}
      </section>)}
      {selectedStep === result.steps.length && <section className="student-step submission-check" id="submission-check"><h2 tabIndex={-1}>제출 전 점검</h2><h3>지침에 명시된 평가 기준</h3>{result.statedCriteria.length ? result.statedCriteria.map((criterion, i) => <div key={i}><p>{criterion.text}</p><Sources sources={criterion.sources} urls={urls} /></div>) : <p>지침에 명시된 평가 기준이 없습니다.</p>}<h3>추가로 확인할 내용 (AI 제안)</h3><ul>{result.suggestedCriteria.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
      </div>
      <nav className="student-step-navigation" aria-label="수행 안내 이동">
        <button type="button" className="button button--secondary" disabled={selectedStep === 0} onClick={() => selectStep(selectedStep - 1)}><ArrowLeft size={17} aria-hidden="true" />이전 단계</button>
        <span>{selectedStep === result.steps.length ? "제출 전 점검" : `${selectedStep + 1} / ${result.steps.length}단계`}</span>
        <button type="button" className="button button--primary" disabled={selectedStep === result.steps.length} onClick={() => selectStep(selectedStep + 1)}>{selectedStep === result.steps.length - 1 ? "제출 전 점검" : "다음 단계"}<ArrowRight size={17} aria-hidden="true" /></button>
      </nav>
    </article>}
    <footer className="student-storage"><span>이 브라우저에 자동 저장됩니다.</span>{(text || files.length > 0 || result) && <button type="button" className="text-button" disabled={!loaded || busy} onClick={() => {
      if ((text || files.length) && !window.confirm("현재 자료와 안내를 지우고 새 과제를 시작할까요?")) return;
      generation.current++; setText(""); setFiles([]); setResult(null); setReferences({}); setSearching(null); setEditing(false); setError("");
    }}>새 과제 시작</button>}</footer>
  </main></>;
}

function Sources({ sources, urls }: { sources: { file: string; page: number; quote: string }[]; urls: Record<string, string> }) {
  if (!sources.length) return <p>관련 원문을 확인하지 못했습니다.</p>;
  return <ul>{sources.map((source, i) => <li key={i}><strong>{source.file}{source.page > 0 ? ` ${source.page}쪽` : ""}</strong>: {source.quote || "원본 확인 필요"}{urls[source.file] && <details><summary>원본 펼쳐보기</summary><iframe title={`${source.file} 원본`} src={`${urls[source.file]}${source.page > 0 ? `#page=${source.page}` : ""}`} /></details>}</li>)}</ul>;
}
