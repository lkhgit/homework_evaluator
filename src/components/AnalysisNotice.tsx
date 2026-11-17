"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function AnalysisNotice({ messages }: { messages: readonly string[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || messages.length === 0) return null;
  return <aside role="alert" className="teacher-analysis-warning">
    <div className="teacher-analysis-warning__heading">
      <strong>원본 자료에서 확인해 주세요</strong>
      <button type="button" aria-label="분석 경고 닫기" onClick={() => setDismissed(true)}><X size={20} aria-hidden="true" /></button>
    </div>
    <ol>{messages.map(message => <li key={message}>{message}</li>)}</ol>
  </aside>;
}
