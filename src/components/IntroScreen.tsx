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
    <main id="main-content" className={`intro-screen${leaving ? " is-leaving" : ""}`}>
      <div className="intro-copy">

        <h1 data-screen-heading tabIndex={-1}>
          학생에게 줄 과제를 점검하세요
        </h1>
        <p className="intro-description">
          학습 목표는 유지하고, 지시문에서 학생이 어려워할 부분을 찾아 수정합니다.
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
