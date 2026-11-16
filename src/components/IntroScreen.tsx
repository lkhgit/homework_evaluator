"use client";

import { getImageProps } from "next/image";
import { ArrowRight, History } from "lucide-react";

import { LogoMark } from "@/components/AppNav";
import { documentLanguageFor } from "@/lib/language";
import { useCallback, useEffect, useRef, useState } from "react";

type IntroPhase =
  | "idle"
  | "artwork"
  | "lens"
  | "headline"
  | "description"
  | "actions"
  | "ready";

const heroImageCommon = { alt: "", sizes: "100vw", quality: 100 } as const;
const {
  props: { srcSet: desktopHeroSrcSet, ...desktopHeroProps },
} = getImageProps({
  ...heroImageCommon,
  src: "/accesslens-hero-v3.png",
  width: 3344,
  height: 1882,
});
const {
  props: { srcSet: mobileHeroSrcSet },
} = getImageProps({
  ...heroImageCommon,
  src: "/accesslens-hero-mobile-v2.png",
  width: 1882,
  height: 3344,
});

function ResponsiveHeroImage({
  eager = false,
  onLoad,
  onError,
}: {
  eager?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <picture>
      <source media="(max-width: 800px)" srcSet={mobileHeroSrcSet} />
      <img
        {...desktopHeroProps}
        alt=""
        srcSet={desktopHeroSrcSet}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onLoad={onLoad}
        onError={onError}
      />
    </picture>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export interface IntroResume {
  title: string;
  savedLabel: string;
  onResume: () => void;
}

export default function IntroScreen({ onEnter, resume = null }: { onEnter: () => void; resume?: IntroResume | null }) {
  const [phase, setPhase] = useState<IntroPhase>("idle");
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [assetSettled, setAssetSettled] = useState(false);
  const [instant, setInstant] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const reducedMotion = useReducedMotion();
  const sequenceStarted = useRef(false);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const finishImmediately = useCallback(() => {
    clearTimers();
    sequenceStarted.current = true;
    setInstant(true);
    setPhase("ready");
    setSequenceComplete(true);
  }, [clearTimers]);

  const beginSequence = useCallback(() => {
    if (sequenceStarted.current) return;
    sequenceStarted.current = true;

    setPhase("artwork");
    timers.current = [
      window.setTimeout(() => setPhase("lens"), 650),
      window.setTimeout(() => setPhase("headline"), 1200),
      window.setTimeout(() => setPhase("description"), 1800),
      window.setTimeout(() => setPhase("actions"), 2400),
      window.setTimeout(() => {
        setPhase("ready");
        setSequenceComplete(true);
      }, 3300),
    ];
  }, []);

  useEffect(() => {
    if (!reducedMotion && !assetSettled) return;

    const startTimer = window.setTimeout(
      reducedMotion ? finishImmediately : beginSequence,
      0,
    );
    return () => window.clearTimeout(startTimer);
  }, [assetSettled, beginSequence, finishImmediately, reducedMotion]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => setAssetSettled(true), 1200);
    return () => window.clearTimeout(fallbackTimer);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!sequenceComplete) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-screen-heading]")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sequenceComplete]);

  function leaveTo(next: () => void) {
    if (!sequenceComplete) return;
    setLeaving(true);
    window.setTimeout(next, reducedMotion ? 80 : 680);
  }

  return (
    <main
      className={`intro-screen intro-screen--lens ${sequenceComplete ? "is-sequence-complete" : ""} ${instant ? "is-instant" : ""} ${leaving ? "is-leaving" : ""}`}
      data-phase={phase}
      aria-busy={!sequenceComplete}
    >
      <div className="intro-artwork" aria-hidden="true">
        <div className="intro-artwork-layer intro-artwork-layer--sharp">
          <ResponsiveHeroImage
            eager
            onLoad={() => setAssetSettled(true)}
            onError={() => setAssetSettled(true)}
          />
        </div>
        <div className="intro-lens-aperture" />
        <div className="intro-optical-bloom" />
        <div className="intro-light-sweep" />
        <div className="intro-artwork-shade" />
        <div className="intro-film-grain" />
      </div>

      <p className="intro-brand"><LogoMark small /> AccessLens</p>

      <div className="intro-copy" aria-hidden={!sequenceComplete}>
        <h1 data-screen-heading tabIndex={sequenceComplete ? -1 : undefined}>
          장벽은 없애고,
          <em>난이도는 지킨다.</em>
        </h1>
        <p className="intro-description">
          AccessLens는 디지털 과제에 숨은 인지 부담과 조작 부담을 찾아냅니다. 교사는 학업 난이도를
          그대로 두고 불필요한 문제만 걷어낼 수 있습니다.
        </p>
        <div className="intro-actions">
          <button
            type="button"
            className="button button--primary button--large"
            onClick={() => leaveTo(onEnter)}
            disabled={!sequenceComplete || leaving}
            tabIndex={sequenceComplete ? 0 : -1}
          >
            <span>{resume ? "새 과제 분석하기" : "과제 분석하기"}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          {resume && (
            <button
              type="button"
              className="button button--ghost-light button--large"
              onClick={() => leaveTo(resume.onResume)}
              disabled={!sequenceComplete || leaving}
              tabIndex={sequenceComplete ? 0 : -1}
            >
              <History size={18} aria-hidden="true" />
              <span>이어서 하기</span>
            </button>
          )}
        </div>
        {resume && (
          <p className="intro-resume-note">
            {resume.savedLabel} 이 브라우저에 저장된 작업: <span lang={documentLanguageFor(resume.title)}>{resume.title}</span>
            {" "}· 새로 시작하면 저장된 작업은 지워집니다.
          </p>
        )}
        <p className="intro-footnote">디지털 과제 접근성 사전 점검</p>
      </div>

      <p className="sr-only" aria-live="polite">
        {sequenceComplete
          ? "AccessLens가 준비되었습니다. 장벽은 없애고, 난이도는 지킨다. 과제 분석하기."
          : "AccessLens 소개 화면을 불러오는 중입니다."}
      </p>
    </main>
  );
}
