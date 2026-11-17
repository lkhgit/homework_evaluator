"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StudentAnalysis } from "@/lib/studentAnalysis";
import { readStored, writeStored } from "@/lib/browserStore";
import { ArrowLeft, FileText, Upload, X, ArrowRight } from "lucide-react";
import StudentFlow from "@/components/StudentFlow";

type Reference = { title: string; url: string };
export default function StudentPage() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<StudentAnalysis | null>(null);
  const [error, setError] = useState("");
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
    setError(""); setBusy(true); setResult(null); setReferences({});
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
  async function search(index: number, action: string) {
    if (references[index]) return;
    const id = generation.current;
    setSearching(index); setError("");
    try {
      const response = await fetch("/api/references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");
      if (id === generation.current) setReferences(current => ({ ...current, [index]: data.links }));
    } catch (e) { if (id === generation.current) setError(e instanceof Error ? e.message : "검색에 실패했습니다."); }
    finally { if (id === generation.current) setSearching(null); }
  }
  return <main className="student-page">
    <header className="workspace-header"><Link href="/"><ArrowLeft size={16} aria-hidden="true" /> 화면 선택</Link><span>학생용</span><Link href="/teacher">선생님용으로 이동</Link></header>
    {(!result || editing) && <><div className="student-heading"><p className="eyebrow">내 과제</p><h1>무엇부터 하면 될까요?</h1><p>과제 지침을 넣으면 해야 할 일을 순서대로 정리해 드립니다.</p></div>
    <section className="student-input" aria-label="과제 자료 입력" aria-busy={busy}>
    <div className="input-section-heading"><h2>과제 자료</h2><span>파일과 글을 함께 넣어도 됩니다</span></div>
    <button type="button" className="upload-zone" disabled={busy || !loaded} onClick={() => fileInput.current?.click()}><Upload size={23} aria-hidden="true" /><strong>지침 파일 추가하기</strong><span>PDF, PNG, JPG · 최대 8개 · 파일당 8MB</span></button>
    <input ref={fileInput} className="sr-only" id="student-files" type="file" accept=".pdf,application/pdf,image/png,image/jpeg" multiple disabled={busy || !loaded} onChange={e => {
      const added = Array.from(e.target.files ?? []); e.target.value = "";
      if (added.some(file => file.size > 8_000_000) || [...files, ...added].reduce((total, file) => total + file.size, 0) > 11_500_000) { setError("파일당 8MB, 전체 약 11MB까지 추가할 수 있습니다. 파일 크기를 줄여 주세요."); return; }
      if (files.length + added.length > 8 || new Set([...files, ...added].map(f => f.name)).size !== files.length + added.length) { setError("파일은 최대 8개이며 이름이 서로 달라야 합니다."); return; }
      setFiles(current => [...current, ...added]); setResult(null); setError("");
    }} />
    <ul className="uploaded-files">{files.map((file, i) => <li key={file.name}><FileText size={18} aria-hidden="true" /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" aria-label={`${file.name} 삭제`} disabled={busy} onClick={() => { setFiles(current => current.filter((_, at) => at !== i)); setResult(null); }}><X size={17} aria-hidden="true" /></button></li>)}</ul>
    <label htmlFor="student-text">지침을 직접 입력하거나 덧붙이세요</label>
    <textarea id="student-text" value={text} disabled={busy || !loaded} maxLength={80000} placeholder="선생님이 알려준 준비물, 제출 방법, 추가 설명 등을 적어 주세요." onChange={e => { setText(e.target.value); setResult(null); }} rows={6} />
    <div className="student-input-footer"><p>자료는 이 브라우저에 자동 저장됩니다.</p><button type="button" className="button button--primary" disabled={busy || !loaded || (!text.trim() && !files.length)} onClick={analyze}>{busy ? "자료를 읽고 있습니다…" : "수행 순서 확인하기"}<ArrowRight size={17} aria-hidden="true" /></button></div>
    {busy && <p className="request-status" role="status">그림과 표까지 살펴보고 있습니다. 자료가 많으면 시간이 조금 걸릴 수 있습니다.</p>}
    </section></>}
    {editing && result && <button type="button" className="button button--secondary" onClick={() => setEditing(false)}>기존 안내로 돌아가기</button>}
    {error && <p role="alert" className="workflow-error">{error}</p>}
    {result && !editing && <article className="student-guide">
      <div className="guide-heading"><div><p className="eyebrow">수행 안내 · {result.steps.length}단계</p><h1 ref={resultHeading} tabIndex={-1}>{result.title}</h1><p>한 단계씩 확인하고, 마지막에 제출 조건을 점검하세요.</p></div><button type="button" className="button button--secondary" onClick={() => setEditing(true)}>자료 수정</button></div>
      <StudentFlow steps={result.steps} selected={selectedStep} onSelect={setSelectedStep} />
      {result.conflicts.length > 0 && <section role="alert" className="student-warning"><h2>확인이 필요한 지침 충돌</h2>{result.conflicts.map((c, i) => <div key={i}><p>{c.description}</p><Sources sources={c.sources} urls={urls} /></div>)}</section>}
      {result.warnings.length > 0 && <section className="student-warning"><h2>원본 확인 필요</h2><ul>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></section>}
      <div id="student-step-detail" aria-live="polite" aria-atomic="false">
      {result.steps.map((step, i) => selectedStep === i && <section className="student-step" key={i}>
        <div className="step-heading"><span>{String(i + 1).padStart(2, "0")}</span><h2>{step.action}</h2></div>
        <dl><dt>준비물</dt><dd>{step.materials || "지침에 명시되지 않음"}</dd><dt>완료 확인</dt><dd>{step.completion || "지침에 명시되지 않음"}</dd><dt>기록·주의사항</dt><dd>{step.caution || "지침에 명시되지 않음"}</dd><dt>어려울 수 있는 부분</dt><dd>{step.difficulties || "지침에 명시되지 않음"}</dd></dl>
        <details className="source-disclosure"><summary>원문과 수행 조건 확인</summary><Sources sources={step.sources} urls={urls} /></details>
        {step.terms.length > 0 && <div>용어: {step.terms.map((term, j) => <details className="term" key={j} onMouseEnter={event => { event.currentTarget.open = true; }} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) event.currentTarget.open = false; }}><summary>{term.term}</summary><p>{term.meaning}</p></details>)}</div>}
        <button type="button" disabled={searching !== null} onClick={() => search(i, `${result.title}: ${step.action}`)}>{searching === i ? "검색 중…" : "참고 자료 찾기"}</button>
        {references[i] && (references[i].length ? <ul>{references[i].map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title || link.url}</a></li>)}</ul> : <p>검색된 자료가 없습니다.</p>)}
      </section>)}
      {selectedStep === result.steps.length && <section className="student-step submission-check" id="submission-check"><h2>제출 전 점검</h2><h3>지침에 명시된 평가 기준</h3>{result.statedCriteria.length ? result.statedCriteria.map((criterion, i) => <div key={i}><p>{criterion.text}</p><Sources sources={criterion.sources} urls={urls} /></div>) : <p>지침에 명시된 평가 기준이 없습니다.</p>}<h3>AI 제안 점검 항목</h3><ul>{result.suggestedCriteria.map((item, i) => <li key={i}>{item}</li>)}</ul></section>}
      </div>
      <nav className="student-step-navigation" aria-label="수행 안내 이동">
        <button type="button" className="button button--secondary" disabled={selectedStep === 0} onClick={() => setSelectedStep(current => current - 1)}><ArrowLeft size={17} aria-hidden="true" />이전 단계</button>
        <span>{selectedStep === result.steps.length ? "제출 전 점검" : `${selectedStep + 1} / ${result.steps.length}단계`}</span>
        <button type="button" className="button button--primary" disabled={selectedStep === result.steps.length} onClick={() => setSelectedStep(current => current + 1)}>{selectedStep === result.steps.length - 1 ? "제출 전 점검" : "다음 단계"}<ArrowRight size={17} aria-hidden="true" /></button>
      </nav>
    </article>}
    <footer className="student-storage"><span>자료는 이 기기에 저장됩니다.</span><button type="button" disabled={!loaded || busy} onClick={() => {
      if ((text || files.length) && !window.confirm("현재 자료와 안내를 지우고 새 과제를 시작할까요?")) return;
      generation.current++; setText(""); setFiles([]); setResult(null); setReferences({}); setEditing(false); setError("");
    }}>새 과제 시작</button></footer>
  </main>;
}

function Sources({ sources, urls }: { sources: { file: string; page: number; quote: string }[]; urls: Record<string, string> }) {
  if (!sources.length) return <p>관련 원문을 확인하지 못했습니다.</p>;
  return <ul>{sources.map((source, i) => <li key={i}><strong>{source.file}{source.page > 0 ? ` ${source.page}쪽` : ""}</strong>: {source.quote || "원본 확인 필요"}{urls[source.file] && <details><summary>원본 펼쳐보기</summary><iframe title={`${source.file} 원본`} src={`${urls[source.file]}${source.page > 0 ? `#page=${source.page}` : ""}`} /></details>}</li>)}</ul>;
}
