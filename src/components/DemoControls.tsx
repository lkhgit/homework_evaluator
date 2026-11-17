"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, RotateCcw } from "lucide-react";
import { resetStored } from "@/lib/browserStore";
import ErrorBanner from "./ErrorBanner";

const NOTICE_KEY = "homework-demo-notice";

export function ResetButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reset() {
    if (!window.confirm("이 브라우저에 저장된 학생용 자료, 교사용 과제, 원본 파일과 변경 이력을 모두 삭제할까요? 삭제 후에는 복원할 수 없습니다.")) return;
    setBusy(true); setError("");
    try {
      await resetStored();
      try { sessionStorage.removeItem(NOTICE_KEY); } catch {}
      // A full reload discards mounted drafts and releases the reset write lock.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch {
      setBusy(false); setError("저장된 자료를 초기화하지 못했습니다. 다시 시도해 주세요.");
    }
  }
  return <><button type="button" className="reset-button" disabled={busy} onClick={reset}><RotateCcw size={16} aria-hidden="true" />{busy ? "초기화 중…" : "초기화"}</button>{error && <ErrorBanner message={error} />}</>;
}

export function DemoNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(NOTICE_KEY) === "seen"; } catch {}
    if (!seen && !dialog.current?.open) dialog.current?.showModal();
  }, []);
  function remember() { try { sessionStorage.setItem(NOTICE_KEY, "seen"); } catch {} }
  return <dialog ref={dialog} className="demo-notice" aria-labelledby="demo-notice-title" onClose={remember}>
    <button type="button" className="demo-notice-close" aria-label="체험 안내 닫기" onClick={() => dialog.current?.close()}><X size={22} aria-hidden="true" /></button>
    <h2 id="demo-notice-title">과제 준비부터 제출까지, 직접 체험해 보세요</h2>
    <p>교사는 과제 지침을 점검하고, 학생은 해야 할 일을 순서대로 확인하는 도구입니다. 답안을 대신 작성하지 않습니다.</p>
    <ul><li>개인 자료 대신 <strong>예시 적용</strong>으로 확산 실험 과제를 불러올 수 있습니다.</li><li>분석 자료는 외부 AI로 전송됩니다. <strong>실제 학생의 이름, 학번 등 개인정보는 넣지 마세요.</strong></li><li>자료와 결과는 이 브라우저에 저장됩니다. 체험 후 상단의 <strong>초기화</strong>로 삭제하세요.</li><li>초기화는 내려받은 파일이나 외부 서비스의 기록까지 삭제하지 않습니다.</li></ul>
    <div className="demo-notice-actions"><Link href="/guide" onClick={() => dialog.current?.close()}>자료 처리 안내</Link><button type="button" className="button button--primary" onClick={() => dialog.current?.close()}>확인하고 시작하기</button></div>
  </dialog>;
}
