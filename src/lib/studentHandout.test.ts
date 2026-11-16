import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import { buildStudentHandout, handoutHtml, handoutPlainText, parseHandoutBlocks } from "./studentHandout";

const sampleHandout = buildStudentHandout({
  title: "Diffusion Lab: Concentration Gradients",
  body: BIOLOGY_TEXT,
  objective: BIOLOGY_SAMPLE.analysisObjective,
});

test("numbered steps in the source become a checklist; prose stays prose", () => {
  const blocks = parseHandoutBlocks("과제 안내입니다.\n\n1. 시뮬레이션을 엽니다.\n2. 값을 기록합니다.\n   표에 적으세요.\n\n3. 제출합니다.");
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "과제 안내입니다." },
    { type: "list", ordered: true, items: ["1. 시뮬레이션을 엽니다.", "2. 값을 기록합니다.\n표에 적으세요.", "3. 제출합니다."] },
  ]);
  const handout = buildStudentHandout({ title: "확산 실험", body: "확산 실험\n\n1. 엽니다.\n2. 기록합니다.", objective: "" });
  assert.equal(handout.hasChecklist, true);
  assert.match(handoutPlainText(handout), /\[ \] 1\. 엽니다\./);
});

test("an assignment written as paragraphs gets no invented steps", () => {
  assert.equal(sampleHandout.hasChecklist, false);
  assert.ok(sampleHandout.blocks.every((block) => block.type === "paragraph"));
  assert.doesNotMatch(handoutPlainText(sampleHandout), /\[ \]/);
});

test("the title line is not printed twice", () => {
  assert.notEqual((sampleHandout.blocks[0] as { text: string }).text, sampleHandout.title);
});

test("the handout carries only student-facing content", () => {
  const text = handoutPlainText(sampleHandout) + handoutHtml(sampleHandout);
  for (const internal of [/\/100/, /\bf[1-5]\b/, /\bs1[01]?\b/, /WCAG/, /마찰/, /문제 지점/, /접근성 점수/, /friction/i, /score/i, /rigor/i, /AccessLens/]) {
    assert.doesNotMatch(text, internal, String(internal));
  }
  assert.ok(text.includes("Observe and remember your three equilibrium values."));
});

test("labels follow the assignment's language; the text is not translated", () => {
  assert.equal(sampleHandout.lang, "en");
  assert.match(handoutPlainText(sampleHandout), /^Diffusion Lab[\s\S]*Learning goal:/);
  const korean = buildStudentHandout({ title: "확산", body: "농도를 바꾸며 관찰합니다.", objective: "농도 기울기를 설명한다." });
  assert.match(handoutPlainText(korean), /이 과제의 학습 목표: 농도 기울기를 설명한다\./);
});

test("the HTML file is a standalone accessible document", () => {
  const html = handoutHtml(buildStudentHandout({ title: "A <b>lab</b>", body: "1. Open it.\n2. Record & submit.", objective: "Goal" }));
  assert.match(html, /^<!doctype html>\n<html lang="en">/);
  assert.match(html, /<h1>A &lt;b&gt;lab&lt;\/b&gt;<\/h1>/);
  assert.match(html, /<h2 id="goal">Learning goal<\/h2>/);
  assert.match(html, /<input type="checkbox" id="item-1"><label for="item-1">1\. Open it\.<\/label>/);
  assert.match(html, /Record &amp; submit/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /<script/);
});

test("a note between two numbered items stays between them", () => {
  const blocks = parseHandoutBlocks("1. Open the sim\n\nThen read this note first.\n2. Enter values");
  assert.deepEqual(blocks, [
    { type: "list", ordered: true, items: ["1. Open the sim"] },
    { type: "paragraph", text: "Then read this note first." },
    { type: "list", ordered: true, items: ["2. Enter values"] },
  ]);
});

test("numbered items are not numbered twice", () => {
  const single = buildStudentHandout({ title: "T", body: "T\n\n1. Only step", objective: "" });
  assert.equal(single.hasChecklist, false);
  const html = handoutHtml(single);
  assert.match(html, /<ol class="numbered"><li>1\. Only step<\/li><\/ol>/);
  assert.match(html, /\.numbered \{ list-style: none|\.checklist, \.numbered \{ list-style: none/);
});

test("an unindented sentence after a finished item stays prose", () => {
  const blocks = parseHandoutBlocks("- 5 points deducted for late work.\nThis is prose.");
  assert.deepEqual(blocks, [
    { type: "list", ordered: false, items: ["5 points deducted for late work."] },
    { type: "paragraph", text: "This is prose." },
  ]);
  // An unfinished item still absorbs its wrapped line.
  assert.deepEqual(parseHandoutBlocks("- Record the three values in\nthe table below."), [
    { type: "list", ordered: false, items: ["Record the three values in\nthe table below."] },
  ]);
});

test("every line of the source reaches the student verbatim", () => {
  const source = [
    "Lab 2",
    "",
    "Read the article first.",
    "Keep this tab open.",
    "",
    "1) Open the simulation.",
    "2) Record three values in",
    "the table.",
    "- Bring a calculator.",
    "- Submit by Friday.",
  ].join("\n");
  const text = handoutPlainText(buildStudentHandout({ title: "Lab 2", body: source, objective: "" }));
  for (const line of source.split("\n").filter(Boolean)) {
    // Bullet glyphs are presentation; the words after them must survive.
    const expected = line.replace(/^- /, "");
    assert.ok(text.includes(expected), `missing or altered: ${expected}`);
  }
  // The teacher's own markers are not normalised.
  assert.match(text, /1\) Open the simulation\./);
  assert.doesNotMatch(text, /1\. Open/);
});

test("nothing is added that the source did not say", () => {
  const handout = buildStudentHandout({ title: "확산 실험", body: "확산 실험\n\n시뮬레이션을 열고 관찰하세요.", objective: "" });
  const text = handoutPlainText(handout);
  // No invented duration, reference box, response options or step numbers.
  assert.doesNotMatch(text, /분|minute|참고 메모|reference|제출 방식|\[ \]|1\./i);
});

test("text that looks like markup or a link stays inert", () => {
  const html = handoutHtml(buildStudentHandout({
    title: "<img src=x onerror=alert(1)>",
    body: "Visit javascript:alert(1) or <a href=\"javascript:alert(2)\">here</a> <script>alert(3)</script>",
    objective: "\" onmouseover=\"alert(4)",
  }));
  // No real element or attribute came from the source: only escaped text.
  assert.doesNotMatch(html, /<(script|img|a)\b|href="|onerror=alert\(1\)>|" onmouseover="/i);
  assert.match(html, /&lt;script&gt;/);
});

test("a single numbered step is not given an extra bullet in plain text", () => {
  const handout = buildStudentHandout({ title: "T", body: "T\n\n1. Only step", objective: "" });
  assert.match(handoutPlainText(handout), /^1\. Only step$/m);
  assert.doesNotMatch(handoutPlainText(handout), /- 1\./);
});
