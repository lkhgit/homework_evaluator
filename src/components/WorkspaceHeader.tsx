import Link from "next/link";
import { ResetButton } from "./DemoControls";

export default function WorkspaceHeader({ mode, children }: {
  mode?: "teacher" | "student";
  children?: React.ReactNode;
}) {
  return <header className="workspace-topbar">
    <div className="workspace-topbar__inner">
      <Link href="/" className="brand-lockup" aria-label="Homework evaluator, 시작 화면">Homework evaluator</Link>
      <div className="workspace-actions">
      {mode && <nav className="workspace-modes" aria-label="사용 화면">
        <Link href="/teacher" aria-current={mode === "teacher" ? "page" : undefined}>교사용</Link>
        <Link href="/student" aria-current={mode === "student" ? "page" : undefined}>학생용</Link>
        <Link href="/guide">이용 안내</Link>
      </nav>}
      <ResetButton />
      </div>
    </div>
    {children}
  </header>;
}
