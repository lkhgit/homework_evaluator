import assert from "node:assert/strict";
import { test } from "node:test";

import { joinRuns, linesFromItems, reflow } from "./pdfText";

const run = (str: string, x: number, width: number, fontSize = 10) => ({ str, x, width, fontSize });

test("words positioned as separate runs keep their spaces", () => {
  assert.equal(joinRuns([run("the", 0, 15), run("quiz", 18, 20)]), "the quiz");
});

test("runs that touch are one word, and existing spaces are not doubled", () => {
  assert.equal(joinRuns([run("concen", 0, 30), run("tration", 30.5, 35)]), "concentration");
  assert.equal(joinRuns([run("the ", 0, 18), run("quiz", 20, 20)]), "the quiz");
});

test("runs arrive out of order and are sorted by position", () => {
  assert.equal(joinRuns([run("quiz", 18, 20), run("the", 0, 15)]), "the quiz");
});

test("text items become top-to-bottom lines with geometry-derived spaces", () => {
  const item = (str: string, x: number, y: number, width: number) => ({
    str, width, height: 10, transform: [10, 0, 0, 10, x, y],
  });
  const lines = linesFromItems([
    item("Second", 0, 100, 30),
    item("line", 34, 100, 18),
    item("First", 0, 200, 25),
    item("line", 28, 200, 18),
    { type: "marked-content" },
  ]);
  assert.deepEqual(lines, ["First line", "Second line"]);
});

test("a full Korean line that wraps is rejoined", () => {
  const first = "시뮬레이션에서 세 번의 시행 결과를 확인하고 각각의 농도 값을 공책에";
  const second = "기록한 뒤 퀴즈로 이동하세요.";
  assert.equal(reflow([first, second]), `${first} ${second}`);
});

test("a hyphen is kept unless it splits a lower-case word across the wrap", () => {
  const long = "Read the instructions for this unit carefully before you open the concen-";
  assert.equal(reflow([long, "tration simulation."]), long.slice(0, -1) + "tration simulation.");
  const named = "Open the simulation and follow the setup instructions in the AccessLens-";
  assert.equal(reflow([named, "Guide."]), `${named}Guide.`);
});
