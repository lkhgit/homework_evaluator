import Link from "next/link";
import { ArrowUpRight, BookOpen, ClipboardList } from "lucide-react";

export default function Home() {
  return <main className="role-choice">
    <header className="workspace-brand">Homework evaluator<span>과제를 읽고, 다음 할 일을 찾다.</span></header>
    <div className="role-choice__intro"><p className="eyebrow">시작하기</p>
    <h1>어떤 도움이 필요한가요?</h1>
    <p>받은 과제를 따라가거나, 학생에게 줄 과제를 다듬으세요.</p></div>
    <div className="role-choice__links">
      <Link href="/student"><BookOpen size={26} aria-hidden="true" /><small>학생</small><strong>과제 따라가기</strong><span>지침을 넣고, 준비부터 제출까지 해야 할 일을 순서대로 확인하세요.</span><b>학생용으로 시작 <ArrowUpRight size={18} aria-hidden="true" /></b></Link>
      <Link href="/teacher"><ClipboardList size={26} aria-hidden="true" /><small>선생님</small><strong>과제 다듬기</strong><span>학생이 막힐 부분을 살펴보고 학습 목표에 맞게 지침을 개선하세요.</span><b>선생님용으로 시작 <ArrowUpRight size={18} aria-hidden="true" /></b></Link>
    </div>
    <footer>PDF·이미지·글로 된 과제 지침을 사용할 수 있습니다.</footer>
  </main>;
}
