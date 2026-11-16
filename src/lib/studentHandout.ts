import { documentLanguageFor } from "./language";

/**
 * The student's copy of an assignment, kept apart from the teacher report.
 *
 * It carries the assignment text (original or accepted rewrite) and the
 * locked learning goal, nothing else: no score, finding or step ids,
 * standards, model notes or teacher rationale. Structure is only ever taken
 * from the text itself. A numbered or bulleted list in the source becomes a
 * checklist; prose stays prose, because inventing steps the teacher did not
 * write would change the assignment.
 */

export type HandoutBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export interface StudentHandout {
  title: string;
  objective: string;
  /** Language of the assignment body; the few handout labels follow it. */
  lang: "ko" | "en";
  objectiveLang: "ko" | "en";
  blocks: HandoutBlock[];
  /** True when the source contains a list the student can tick through. */
  hasChecklist: boolean;
}

const LABELS = {
  ko: { goal: "이 과제의 학습 목표", instructions: "과제 안내", check: "완료하면 표시하세요" },
  en: { goal: "Learning goal", instructions: "Instructions", check: "Tick each item when done" },
} as const;

export function handoutLabels(lang: StudentHandout["lang"]) {
  return LABELS[lang];
}

const LIST_ITEM = /^\s*(?:(\d{1,3})[.)]|[-•*–·])\s+(.*)$/;

/**
 * A line after a list item belongs to that item only when it looks wrapped:
 * indented under it, or following an item that has not finished its sentence.
 * Otherwise it is prose, and must not end up under a student's checkbox.
 */
function isContinuation(rawLine: string, previousItem: string): boolean {
  if (/^\s+/.test(rawLine)) return true;
  return !/[.!?…:;)\]"'”’」』。]$/.test(previousItem.trim());
}

/** Splits assignment text into paragraphs and the lists it actually contains. */
export function parseHandoutBlocks(text: string): HandoutBlock[] {
  const blocks: HandoutBlock[] = [];
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);

  for (const raw of paragraphs) {
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    let prose: string[] = [];
    const flushProse = () => {
      // Line breaks are kept: the student sees the teacher's text as written.
      if (prose.length > 0) blocks.push({ type: "paragraph", text: prose.join("\n") });
      prose = [];
    };

    let previousWasItem = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const match = LIST_ITEM.exec(line);
      if (match) {
        // Flush first, so a note written between two items stays between
        // them instead of being moved after the list.
        flushProse();
        const last = blocks[blocks.length - 1];
        const ordered = match[1] !== undefined;
        // Ordered items keep the teacher's own marker exactly ("1)" stays
        // "1)"); renderers suppress automatic numbering so it is never printed
        // twice. A bullet glyph is presentation and is replaced by the list.
        const item = ordered ? line : match[2];
        if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
        else blocks.push({ type: "list", ordered, items: [item] });
        previousWasItem = true;
        continue;
      }
      const last = blocks[blocks.length - 1];
      if (previousWasItem && last?.type === "list" && isContinuation(rawLine, last.items[last.items.length - 1])) {
        // A wrapped continuation of the list item on the line above.
        last.items[last.items.length - 1] += `\n${line}`;
        continue;
      }
      prose.push(line);
      previousWasItem = false;
    }
    flushProse();
  }
  return blocks;
}

export function buildStudentHandout(input: {
  title: string;
  body: string;
  objective: string;
}): StudentHandout {
  const title = input.title.trim();
  let blocks = parseHandoutBlocks(input.body);
  // The body usually opens with the title line; do not print it twice.
  const first = blocks[0];
  if (first?.type === "paragraph" && first.text.trim() === title) blocks = blocks.slice(1);
  const listItems = blocks
    .filter((block): block is Extract<HandoutBlock, { type: "list" }> => block.type === "list")
    .reduce((count, block) => count + block.items.length, 0);
  return {
    title,
    objective: input.objective.trim(),
    lang: documentLanguageFor(input.body),
    objectiveLang: documentLanguageFor(input.objective),
    blocks,
    hasChecklist: listItems >= 2,
  };
}

/** Plain text for pasting into an LMS or a document. */
export function handoutPlainText(handout: StudentHandout): string {
  const labels = handoutLabels(handout.lang);
  const lines: string[] = [handout.title, ""];
  if (handout.objective) lines.push(`${labels.goal}: ${handout.objective}`, "");
  for (const block of handout.blocks) {
    if (block.type === "paragraph") lines.push(block.text, "");
    else {
      // Ordered items already carry the teacher's own number.
      for (const item of block.items) lines.push(handout.hasChecklist ? `[ ] ${item}` : block.ordered ? item : `- ${item}`);
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A standalone, accessible HTML file: semantic headings, a real list with
 * labelled checkboxes, readable type and print styles. No scripts.
 */
export function handoutHtml(handout: StudentHandout): string {
  const labels = handoutLabels(handout.lang);
  const body: string[] = [];
  let checkbox = 0;
  for (const block of handout.blocks) {
    if (block.type === "paragraph") {
      body.push(`<p>${escapeHtml(block.text)}</p>`);
      continue;
    }
    const tag = block.ordered ? "ol" : "ul";
    if (!handout.hasChecklist) {
      body.push(`<${tag}${block.ordered ? ' class="numbered"' : ""}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const items = block.items
      .map((item) => {
        checkbox++;
        const id = `item-${checkbox}`;
        return `<li><input type="checkbox" id="${id}"><label for="${id}">${escapeHtml(item)}</label></li>`;
      })
      .join("");
    body.push(`<${tag} class="checklist" aria-label="${escapeHtml(labels.check)}">${items}</${tag}>`);
  }

  const goal = handout.objective
    ? `<section aria-labelledby="goal"><h2 id="goal">${escapeHtml(labels.goal)}</h2><p lang="${handout.objectiveLang}">${escapeHtml(handout.objective)}</p></section>`
    : "";

  return `<!doctype html>
<html lang="${handout.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(handout.title)}</title>
<style>
  body { max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; color: #1f1a1a; background: #fff; font: 1.05rem/1.6 system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; word-break: keep-all; overflow-wrap: anywhere; }
  h1 { font-size: 1.6rem; line-height: 1.3; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  .checklist, .numbered { list-style: none; padding-left: 0; }
  p, li, label { white-space: pre-line; }
  .checklist li { display: flex; gap: .6rem; align-items: flex-start; margin: .55rem 0; }
  .checklist input { width: 1.2rem; height: 1.2rem; margin-top: .25rem; flex: none; }
  @media print {
    body { margin: 0; max-width: none; font-size: 12pt; }
    h2 { break-after: avoid; }
    li, p { break-inside: avoid; }
  }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(handout.title)}</h1>
${goal}
<section aria-labelledby="instructions"><h2 id="instructions">${escapeHtml(labels.instructions)}</h2>
${body.join("\n")}
</section>
</main>
</body>
</html>
`;
}
