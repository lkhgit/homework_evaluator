import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Guards the stylesheet against the WCAG 1.4.3 and legibility regressions the
// first review measured. Ratios use the WCAG relative-luminance formula.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = new RegExp(String.raw`--${name}:\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(match, `token --${name} not found`);
  return match[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("text colour tokens meet 4.5:1 on the backgrounds they are used on", () => {
  const pairs: Array<[string, string]> = [
    ["muted", "surface"],
    ["muted", "cream"],
    ["muted", "blush-pale"],
    ["muted", "green-soft"],
    ["green", "green-soft"],
    ["green", "paper"],
    ["orange", "surface"],
    ["rose-deep", "blush-pale"],
    ["danger", "surface"],
    ["ink", "cream"],
  ];
  for (const [text, background] of pairs) {
    const ratio = contrast(token(text), token(background));
    assert.ok(ratio >= 4.5, `--${text} on --${background} is ${ratio.toFixed(2)}:1`);
  }
});

test("no rule sets text below 0.75rem", () => {
  const tooSmall = [...css.matchAll(/font-size:\s*(0?\.\d+)rem/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 0.75);
  assert.deepEqual(tooSmall, []);
  const clampMinimums = [...css.matchAll(/font-size:\s*clamp\((0?\.\d+)rem/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 0.75);
  assert.deepEqual(clampMinimums, []);
});

test("small labels are not dimmed below their colour's contrast with opacity", () => {
  assert.doesNotMatch(css, /font-size:\s*0?\.\d+rem;\s*opacity:\s*0?\.[0-8]/);
});

test("hard-coded text colours on light surfaces also meet 4.5:1", () => {
  // Rules that set light text on a dark or saturated fill are excluded; their
  // backgrounds are gradients this check cannot evaluate.
  const onDarkFill = /intro-screen|intro-brand|button--primary|button--ghost-light|goal-tag|is-active \.progress-number/;
  const failures: string[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    const colour = /(?:^|;|\s)color:\s*(#[0-9a-fA-F]{6})\b/.exec(rule[2]);
    if (!colour || onDarkFill.test(selector)) continue;
    const ratio = Math.min(contrast(colour[1], token("surface")), contrast(colour[1], token("cream")));
    if (ratio < 4.5) failures.push(`${selector}: ${colour[1]} ${ratio.toFixed(2)}:1`);
  }
  assert.deepEqual(failures, []);
});

test("no rule sets text below 12px", () => {
  const tooSmall = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 12);
  assert.deepEqual(tooSmall, []);
});

test("white text on the teal goal tag meets 4.5:1", () => {
  const ratio = contrast("#ffffff", token("rose-deep"));
  assert.ok(ratio >= 4.5, `white on --rose-deep is ${ratio.toFixed(2)}:1`);
});
