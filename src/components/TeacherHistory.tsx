"use client";
import { useEffect, useRef, useState } from "react";
import { readStored, writeStored } from "@/lib/browserStore";
import { versionKey, type TeacherSnapshot } from "@/lib/teacherSnapshot";

type Version = { label: string; date: string; snapshot: TeacherSnapshot };
type Archive = { current: TeacherSnapshot | null; projects: Record<string, Version[]> };
export default function TeacherHistory({ snapshot, onRestore }: { snapshot: TeacherSnapshot; onRestore: (value: TeacherSnapshot) => void }) {
  const [archive, setArchive] = useState<Archive>({ current: null, projects: {} });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const restore = useRef(onRestore);
  useEffect(() => { restore.current = onRestore; });
  const pending = useRef(Promise.resolve());
  function persist(value: Archive) {
    pending.current = pending.current.catch(() => {}).then(() => writeStored("teacher-archive", value));
    pending.current.catch(() => setError("변경 이력을 저장하지 못했습니다. 저장 공간을 확인해 주세요."));
  }
  useEffect(() => {
    let active = true;
    readStored<Archive>("teacher-archive").then(value => {
      if (!active) return;
      if (value) { setArchive(value); if (value.current) restore.current(value.current); }
      setReady(true);
    }).catch(() => { if (active) { setError("변경 이력을 읽지 못했습니다."); setReady(true); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || snapshot.stage === "loading" || snapshot.stage === "intro") return;
    const timer = window.setTimeout(() => {
      setArchive(previous => {
        const versions = previous.projects[snapshot.projectId] ?? [];
        const last = versions.at(-1);
        const complete = snapshot.visited.includes("journey") && snapshot.assignmentDraft === snapshot.analyzedText;
        const changed = complete && (!last || versionKey(last.snapshot) !== versionKey(snapshot));
        const next = { current: snapshot, projects: { ...previous.projects, [snapshot.projectId]: changed ? [...versions, { label: last ? "과제·개선안 변경" : "최초 분석", date: new Date().toLocaleString("ko-KR"), snapshot }] : versions } };
        persist(next);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [ready, snapshot]);
  return <details className="teacher-history"><summary>과제별 변경 이력</summary><p>이 브라우저에 저장됩니다. 브라우저 데이터를 삭제하면 사라집니다.</p>{error && <p role="alert">{error}</p>}{Object.entries(archive.projects).map(([id, versions]) => <section key={id}><h3>{versions[0]?.snapshot.analyzedText.slice(0, 50) || "분석 전 과제"}</h3><ol>{versions.map((version, index) => <li key={index}>{index + 1}. {version.label} · {version.date}<details><summary>과제 보기</summary><pre style={{ whiteSpace: "pre-wrap" }}>{version.snapshot.analyzedText}</pre></details><button type="button" onClick={() => {
      const value = { ...version.snapshot, stage: "journey" as const };
      const next = { current: value, projects: { ...archive.projects, [id]: [...versions, { snapshot: value, label: `${index + 1}번 버전 복원`, date: new Date().toLocaleString("ko-KR") }] } };
      setArchive(next); persist(next); onRestore(value);
    }}>이 상태로 돌아가기</button></li>)}</ol><button type="button" onClick={() => { const projects = { ...archive.projects }; delete projects[id]; const next = { ...archive, projects }; setArchive(next); persist(next); }}>이 과제의 이력 삭제</button></section>)}</details>;
}
