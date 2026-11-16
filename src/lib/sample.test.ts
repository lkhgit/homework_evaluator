import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE } from "@/samples/biology";
import { runEngine, scoreAccessibility } from "./engine";
import { applyRepairs } from "./repairs";

// The bundled sample is the first thing an educator sees, so it must follow
// the same rules the app holds a model to and agree with its own measurements.
const analysis = BIOLOGY_SAMPLE.analysis;
const report = runEngine(analysis);

test("the sample names each tool once, as the prompt requires", () => {
  assert.deepEqual(report.switching.uniqueEnvironments, ["Canvas", "External article", "PhET simulation", "Recording tool"]);
  assert.equal(report.switching.transitions, 5);
  const switching = analysis.frictionMoments.find((item) => item.barrierType === "context_switching")!;
  assert.match(switching.title, /Four tools/);
});

test("contextSwitch flags match the environment sequence", () => {
  analysis.steps.forEach((step, index) => {
    const expected = index > 0 && step.environment !== analysis.steps[index - 1].environment;
    assert.equal(step.demands.contextSwitch, expected, step.id);
  });
});

test("the timer finding's severity matches the measured timing", () => {
  assert.equal(report.timing.verdict, "comfortable");
  assert.equal(report.timing.verdictConservative, "comfortable");
  const timer = analysis.frictionMoments.find((item) => item.barrierType === "time_pressure")!;
  assert.notEqual(timer.severity, "high", "a comfortable timer cannot be a high-severity finding");
});

test("sample scores and resolutions stay as measured", () => {
  assert.equal(scoreAccessibility(report, analysis).score, 52);
  const all = applyRepairs(analysis, analysis.steps.filter((step) => step.repair).map((step) => step.id));
  const status = Object.fromEntries(all.frictionResolutions.map((item) => [item.frictionId, item.status]));
  // f3 is a qualitative concern (a comfortable timer that cannot be paused):
  // removing the timer is recorded but cannot be verified as a measured fix.
  // f5 has no consolidating repair proposed, so it honestly stays open.
  assert.deepEqual(status, { f1: "resolved", f2: "resolved", f3: "unverified", f4: "resolved", f5: "unresolved" });
  const resolved = new Set(all.frictionResolutions.filter((item) => item.status === "resolved").map((item) => item.frictionId));
  assert.equal(scoreAccessibility(runEngine(all.analysis), all.analysis, resolved).score, 81);
});
