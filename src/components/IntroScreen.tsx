"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function IntroScreen({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function enter() {
    setLeaving(true);
    timer.current = window.setTimeout(onEnter, 240);
  }

  return (
    <main className={`intro-screen${leaving ? " is-leaving" : ""}`}>
      <div className="intro-copy">
        <p className="intro-kicker">Homework evaluator</p>
        <h1 data-screen-heading tabIndex={-1}>
          장벽은 없애고,
          <em>난이도는 지킨다.</em>
        </h1>
        <p className="intro-description">
          Homework evaluator는 디지털 과제 안에 숨어 있는 인지적·기능적 부담을 드러내어, 교사가 학업 난이도를
          낮추지 않고도 불필요한 장벽을 제거할 수 있도록 돕습니다.
        </p>
        <button
          type="button"
          className="button button--primary button--large"
          onClick={enter}
          disabled={leaving}
        >
          <span>과제 분석하기</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="intro-footnote">디지털 학습 과제를 위한 접근성 사전 점검</p>
      </div>
    </main>
  );
}
