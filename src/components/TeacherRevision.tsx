"use client";

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
  return <section className="student-step"><h2>과제 수정 요청</h2><p>원하는 변경을 입력하고 수정안을 확인한 후 적용하세요. 적용하면 과제를 다시 분석합니다.</p>
    <label htmlFor="revision-instruction">수정 요청</label><textarea id="revision-instruction" rows={3} value={instruction} maxLength={4000} onChange={e => setInstruction(e.target.value)} />
    <button type="button" disabled={busy || !instruction.trim()} onClick={propose}>{busy ? "수정안 작성 중…" : "수정안 만들기"}</button>
    {error && <p role="alert">{error}</p>}
    {proposal && <div><p>{proposal.explanation}</p><details><summary>수정된 전체 과제 확인</summary><pre style={{ whiteSpace: "pre-wrap" }}>{proposal.revised}</pre></details><button type="button" onClick={() => replace(proposal.revised)}>수정안 적용</button></div>}
  </section>;
}
