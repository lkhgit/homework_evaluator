/**
 * Pulls the text layer out of a PDF in the browser.
 *
 * Extraction happens client-side on purpose: the rest of the pipeline verifies
 * that every evidence quote appears verbatim in the source, and highlights it
 * by position. Sending the PDF straight to the model would produce an analysis
 * with no text to check those quotes against.
 */

import { REQUEST_LIMITS } from "./requestLimits";

export class PdfTextError extends Error {}

/** Larger files are refused before parsing; a text assignment is rarely over a few MB. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** Pages past this are not read; the text limit is reached long before. */
export const MAX_PDF_PAGES = 60;

/** A line that starts a new block rather than continuing the previous one. */
const BLOCK_START = /^(\d+[.)]\s|[-•–*]\s|step\s+\d+|part\s+[a-z0-9]+\b)/i;

/** Hangul and other CJK characters take about twice the width of a Latin letter. */
function visualLength(line: string): number {
  let length = 0;
  for (const char of line) {
    length += /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char) ? 2 : 1;
  }
  return length;
}

/**
 * Rejoins lines that a PDF wrapped mid-sentence. Without this, a sentence split
 * across two lines never matches the verbatim quote the model returns, and the
 * barrier trace loses its highlight.
 */
export function reflow(lines: string[]): string {
  const out: string[] = [];

  for (const line of lines) {
    const previous = out[out.length - 1];
    const continuesPrevious =
      previous !== undefined &&
      !/[.!?:;"”。]$/.test(previous) &&
      !BLOCK_START.test(line) &&
      // A short unpunctuated line is a heading, not a wrapped sentence.
      // Measured visually so a full Korean line is not mistaken for one.
      visualLength(previous) >= 50;

    if (continuesPrevious) {
      // Drop a hyphen only where it splits a lower-case word across the wrap;
      // "AccessLens-" followed by "Guide" keeps its hyphen.
      out[out.length - 1] = /[a-z]-$/.test(previous) && /^[a-z]/.test(line)
        ? previous.slice(0, -1) + line
        : previous.endsWith("-")
          ? previous + line
          : `${previous} ${line}`;
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

export interface TextRun {
  str: string;
  /** x of the run's origin, in PDF user space. */
  x: number;
  /** Advance width of the run, in the same units. */
  width: number;
  /** Font size, in the same units. */
  fontSize: number;
}

/**
 * Joins the runs on one baseline. Producers that position each word as its own
 * run emit no space glyphs, so joining with "" merged "the quiz" into
 * "thequiz". A horizontal gap wider than a fraction of the font size is the
 * space the producer drew without a glyph.
 */
export function joinRuns(runs: TextRun[]): string {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  let line = "";
  let previous: TextRun | null = null;
  for (const run of sorted) {
    if (previous) {
      const gap = run.x - (previous.x + previous.width);
      const threshold = 0.2 * Math.max(previous.fontSize, run.fontSize, 1);
      const alreadySpaced = /\s$/.test(line) || /^\s/.test(run.str);
      if (gap > threshold && !alreadySpaced) line += " ";
    }
    line += run.str;
    previous = run;
  }
  return line.replace(/\s+/g, " ").trim();
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Rebuilds reading-order lines from one page's positioned text items. */
export function linesFromItems(items: readonly unknown[]): string[] {
  // The text layer is a bag of positioned runs, so lines are rebuilt by
  // grouping on the baseline y. A run's `hasEOL` flag is deliberately ignored:
  // some producers set it mid-word, which would split words and break the
  // verbatim evidence matching this text later feeds.
  const rows = new Map<number, TextRun[]>();
  for (const raw of items) {
    const item = raw as Partial<PdfTextItem>;
    if (typeof item.str !== "string" || item.str === "" || !Array.isArray(item.transform)) continue;
    const [a = 0, b = 0, , , x = 0, rawY = 0] = item.transform;
    const y = Math.round(rawY / 3) * 3; // 3pt tolerance
    const fontSize = Math.hypot(a, b) || item.height || 0;
    const run = { str: item.str, x, width: item.width ?? 0, fontSize };
    const row = rows.get(y);
    if (row) row.push(run);
    else rows.set(y, [run]);
  }
  return [...rows.entries()]
    .sort((first, second) => second[0] - first[0]) // top of page first
    .map(([, runs]) => joinRuns(runs))
    .filter(Boolean);
}

export async function extractPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfTextError("PDF 파일이 너무 큽니다. 최대 20MB까지 올릴 수 있으니 과제 내용을 직접 붙여넣어 주세요.");
  }

  const pdfjs = await import("pdfjs-dist");

  // Bundled worker, resolved by the build rather than fetched from a CDN, so
  // the app keeps working offline during a demo.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  let document: Awaited<typeof loadingTask.promise> | null = null;
  try {
    try {
      document = await loadingTask.promise;
    } catch {
      throw new PdfTextError("이 PDF를 열 수 없습니다. 파일이 손상됐거나 비밀번호가 걸려 있을 수 있습니다.");
    }

    const pages: string[] = [];
    const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
    let characters = 0;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = reflow(linesFromItems(content.items));
        pages.push(text);
        characters += text.length;
      } finally {
        page.cleanup();
      }
      // Past the analysis limit there is nothing more the app can use.
      if (characters > REQUEST_LIMITS.assignmentChars) break;
    }

    const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();

    if (text.length < 40) {
      throw new PdfTextError(
        "읽을 수 있는 텍스트가 없습니다. 스캔한 이미지 PDF로 보입니다. AccessLens는 텍스트 레이어가 있는 PDF만 읽으니 과제 내용을 직접 붙여넣어 주세요."
      );
    }

    return text;
  } finally {
    // Always release the document and its worker, including when parsing fails
    // partway or the PDF has no text layer. In pdfjs-dist 6 the document proxy
    // has no destroy(); destroying its loading task tears both down.
    await document?.cleanup().catch(() => undefined);
    await loadingTask.destroy().catch(() => undefined);
  }
}
