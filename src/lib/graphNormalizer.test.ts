import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAnalysisGraph } from "./graphNormalizer";
import { BIOLOGY_SAMPLE } from "../samples/biology";

test("normalization repairs duplicate ids and discards ambiguous relationships", () => {
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  source.steps[0].id = "duplicate";
  source.steps[1].id = "duplicate";
  source.steps[1].consumes = ["not_produced_yet"];
  source.steps[2].consumes = ["never_produced"];
  source.steps[2].demands.contextSwitch = false;
  source.frictionMoments = [
    { ...source.frictionMoments[0], id: "finding", stepIds: ["duplicate", "missing"] },
  ];
  source.timeConstraints = [
    { id: "timer", limitMinutes: 12, stepIds: ["duplicate", "missing"], evidence: "" },
  ];

  const result = normalizeAnalysisGraph(source);
  assert.equal(new Set(result.analysis.steps.map((step) => step.id)).size, source.steps.length);
  assert.match(result.analysis.steps[0].id, /^duplicate__/);
  assert.match(result.analysis.steps[1].id, /^duplicate__/);
  assert.deepEqual(result.analysis.steps[1].consumes, []);
  assert.deepEqual(result.analysis.steps[2].consumes, []);
  assert.equal(result.analysis.steps[2].demands.contextSwitch, true);
  assert.deepEqual(result.analysis.frictionMoments, []);
  assert.deepEqual(result.analysis.timeConstraints, []);
  assert.ok(result.warnings.length >= 6);
});

test("normalization preserves valid references and removes duplicate values", () => {
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  source.steps[0].produces = ["reference", "reference"];
  source.steps[1].consumes = ["reference", "reference"];
  const result = normalizeAnalysisGraph(source);

  assert.deepEqual(result.analysis.steps[0].produces, ["reference"]);
  assert.deepEqual(result.analysis.steps[1].consumes, ["reference"]);
  assert.deepEqual(result.analysis.timeConstraints[0].stepIds, ["s8", "s9"]);
  assert.equal(result.analysis.frictionMoments.length, source.frictionMoments.length);
});

test("prerequisites point only backwards and include whoever produced consumed information", () => {
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  // s8 consumes the trial values produced at s5; leave s5 out on purpose.
  const s8 = source.steps.findIndex((step) => step.id === "s8");
  source.steps[s8].requires = ["s7", "s8", "s11", "missing"];
  // A field missing entirely, as in an analysis saved before it existed.
  delete (source.steps[1] as { requires?: string[] }).requires;

  const result = normalizeAnalysisGraph(source);
  assert.deepEqual(result.analysis.steps[s8].requires.sort(), ["s5", "s7"]);
  assert.deepEqual(result.analysis.steps[1].requires, []);
  assert.ok(result.warnings.some((warning) => warning.includes("선행 단계")));
});
