import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList } from "lucide-react";
import WorkspaceHeader from "@/components/WorkspaceHeader";

export default function Home() {
  return <>
    <WorkspaceHeader />
    <main className="role-choice" id="main-content">
      <div className="screen-heading">
        <h1>과제 준비부터 제출까지</h1>
        <p>교사는 과제 지침을 점검하고, 학생은 해야 할 일을 확인합니다. 답안을 대신 작성하지 않습니다. 예시 적용으로 파일 없이 체험해 보세요.</p>
      </div>
      <div className="role-choice__links">
        <Link href="/teacher">
          <ClipboardList size={24} aria-hidden="true" />
          <h2>교사용</h2>
          <p>학생이 어려워할 부분을 찾고, 학습 목표에 맞게 과제 지침을 수정하세요.</p>
          <span>과제 점검하기 <ArrowRight size={18} aria-hidden="true" /></span>
        </Link>
        <Link href="/student">
          <BookOpen size={24} aria-hidden="true" />
          <h2>학생용</h2>
          <p>받은 과제를 넣고, 준비물과 해야 할 일, 제출 조건을 순서대로 확인하세요.</p>
          <span>내 과제 시작하기 <ArrowRight size={18} aria-hidden="true" /></span>
        </Link>
      </div>
      <footer>PDF, 이미지 또는 글로 된 과제 지침을 사용하세요.</footer>
    </main>
  </>;
}
