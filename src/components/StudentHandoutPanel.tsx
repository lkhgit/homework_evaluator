"use client";

import { useEffect, useState } from "react";
import { Copy, Download, Printer } from "lucide-react";

import { downloadFile, handoutFilename } from "@/lib/exportSummary";
import {
  handoutHtml,
  handoutLabels,
  handoutPlainText,
  type StudentHandout,
} from "@/lib/studentHandout";

/**
 * The student's copy, shown as the student will get it, with copy, download
 * and print. Printing hides everything on the page except this handout.
 */
export default function StudentHandoutPanel({
  handout,
  unchanged,
  compact = false,
  guide = null,
}: {
  handout: StudentHandout;
  unchanged: boolean;
  /** The step-by-step guide built from the AI rewrite, when there is one. */
  guide?: { html: string; filename: string } | null;
  /** Actions only on screen; the sheet is still rendered for printing. */
  compact?: boolean;
}) {
  const [status, setStatus] = useState("");
  const labels = handoutLabels(handout.lang);

  useEffect(() => {
    const clear = () => document.body.classList.remove("is-printing-handout");
    window.addEventListener("afterprint", clear);
    return () => {
      window.removeEventListener("afterprint", clear);
      clear();
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(handoutPlainText(handout));
      setStatus("학생용 과제 텍스트를 복사했습니다.");
    } catch {
      setStatus("이 브라우저에서는 복사할 수 없습니다. 내려받기를 사용하세요.");
    }
  }

  function download() {
    downloadFile(handoutFilename(handout.title), handoutHtml(handout), "text/html;charset=utf-8");
    setStatus("학생용 활동지(HTML)를 내려받았습니다.");
  }

  function downloadGuide() {
    if (!guide) return;
    downloadFile(guide.filename, guide.html, "text/html;charset=utf-8");
    setStatus("단계별 학생 안내(HTML)를 내려받았습니다.");
  }

  function print() {
    document.body.classList.add("is-printing-handout");
    window.print();
  }

  let checkbox = 0;
  return (
    <section className={`student-handout${compact ? " student-handout--compact" : ""}`} aria-labelledby="handout-heading">
      <div className="student-handout__toolbar">
        <div>
          <h2 id="handout-heading">학생용 활동지</h2>
          <p>
            학생에게 줄 과제만 담았습니다. 점수, 문제 지점, 기준, 교사용 메모는 포함하지 않습니다.
            {unchanged ? " 채택한 개선안이 없어 원본 과제 그대로입니다." : " 채택한 개선안을 반영한 AI 수정본이므로 배포 전에 직접 확인하세요."}
            {" "}과제 본문은 번역하지 않습니다.
          </p>
        </div>
        <div className="student-handout__actions">
          <button type="button" className="button button--small button--secondary" onClick={copy}>
            <Copy size={14} aria-hidden="true" /> 텍스트 복사
          </button>
          <button type="button" className="button button--small button--secondary" onClick={download}>
            <Download size={14} aria-hidden="true" /> HTML 내려받기
          </button>
          {guide && (
            <button type="button" className="button button--small button--secondary" onClick={downloadGuide}>
              <Download size={14} aria-hidden="true" /> 단계별 안내 HTML 내려받기
            </button>
          )}
          <button type="button" className="button button--small button--secondary" onClick={print}>
            <Printer size={14} aria-hidden="true" /> 인쇄
          </button>
        </div>
        <p className="sr-only" aria-live="polite">{status}</p>
        {status && <p className="student-handout__status" aria-hidden="true">{status}</p>}
      </div>

      <article className="student-handout__sheet" lang={handout.lang}>
        <h3 className="student-handout__title">{handout.title}</h3>
        {handout.objective && (
          <section className="student-handout__goal">
            <h4>{labels.goal}</h4>
            <p lang={handout.objectiveLang}>{handout.objective}</p>
          </section>
        )}
        <section>
          <h4>{labels.instructions}</h4>
          {handout.blocks.map((block, index) => {
            if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
            const List = block.ordered ? "ol" : "ul";
            if (!handout.hasChecklist) {
              return (
                <List key={index} className={block.ordered ? "student-handout__numbered" : undefined}>
                  {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
                </List>
              );
            }
            return (
              <List key={index} className="student-handout__checklist" aria-label={labels.check}>
                {block.items.map((item) => {
                  checkbox++;
                  const id = `handout-item-${checkbox}`;
                  return (
                    <li key={id}>
                      <input type="checkbox" id={id} />
                      <label htmlFor={id}>{item}</label>
                    </li>
                  );
                })}
              </List>
            );
          })}
        </section>
      </article>
    </section>
  );
}
