"use client";

import ErrorBanner from "./ErrorBanner";
import { useEffect, useRef, useState } from "react";


export default function TeacherRevision({ text, objective, onReplace }: { text: string; objective: string; onReplace: (text: string) => void }) {
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<{ revised: string; explanation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    invalidate();
    return invalidate;
  }, [text, objective]);
  async function propose() {
    const id = ++generation.current;
    setError(""); setProposal(null); setBusy(true);
    try {
      const response = await fetch("/api/teacher-revise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, objective, instruction }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "수정안을 만들지 못했습니다.");
      if (generation.current === id) setProposal(data);
    } catch (e) { if (generation.current === id) setError(e instanceof Error ? e.message : "수정안을 만들지 못했습니다."); }
    finally { setBusy(false); }
  }
  function replace(value: string) { generation.current++; setProposal(null); onReplace(value); }
  return <details className="teacher-revision"><summary>과제 지침을 직접 수정하고 싶다면</summary><div className="teacher-revision__body"><h2>수정 요청</h2><p>원하는 변경을 적어 주세요. 수정안을 적용하면 과제 입력 화면에서 다시 분석할 수 있습니다.</p>
    <label htmlFor="revision-instruction">수정 요청</label><textarea id="revision-instruction" placeholder="예: 제출 방법을 지시문 마지막에 따로 정리해 주세요." disabled={busy} rows={3} value={instruction} maxLength={4000} onChange={e => setInstruction(e.target.value)} />
    <button type="button" className="button button--secondary" disabled={busy || !instruction.trim()} onClick={propose}>{busy ? "수정안 작성 중…" : "수정안 만들기"}</button>
    {error && <ErrorBanner message={error} />}
    {proposal && <div><p>{proposal.explanation}</p><details><summary>수정된 전체 과제 확인</summary><pre style={{ whiteSpace: "pre-wrap" }}>{proposal.revised}</pre></details><button type="button" className="button button--primary" onClick={() => replace(proposal.revised)}>이 수정안 사용하기</button></div>}
  </div></details>;
}
