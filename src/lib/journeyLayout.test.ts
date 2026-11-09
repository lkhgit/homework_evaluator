import assert from "node:assert/strict";
import { test } from "node:test";

import { runEngine } from "./engine";
import { buildJourneyLayout, NODE_W } from "./journeyLayout";
import type { Analysis, Step } from "./schema";

function step(overrides: Partial<Step> & Pick<Step, "id" | "environment">): Step {
  return {
    action: "does something",
    produces: [],
    consumes: [],
    requires: [],
    producedInfoStaysVisible: true,
    estimatedMinutes: null,
    evidence: "",
    goalRelevance: "unknown",
    relevanceReason: "",
    repair: null,
    ...overrides,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
      ...overrides.demands,
    },
  } as Step;
}

const switched = { contextSwitch: true } as Step["demands"];

// Canvas -> PhET -> PhET -> Canvas -> Canvas, with two values that vanish when
// the simulation closes and one note that stays visible.
const analysis: Analysis = {
  steps: [
    step({ id: "s1", environment: "Canvas" }),
    step({
      id: "s2",
      environment: " PhET ",
      demands: switched,
      produces: ["trial_1", "trial_2"],
      producedInfoStaysVisible: false,
    }),
    step({ id: "s3", environment: "PhET", produces: ["note"], producedInfoStaysVisible: true }),
    step({ id: "s4", environment: "Canvas", demands: switched, consumes: ["trial_1", "trial_2", "note"] }),
    step({ id: "s5", environment: "Canvas" }),
  ],
  timeConstraints: [
    { id: "timer-1", limitMinutes: 12, stepIds: ["s5", "s4", "missing"], evidence: "" },
    { id: "timer-2", limitMinutes: 5, stepIds: ["missing"], evidence: "" },
  ],
  frictionMoments: [],
};

const layout = buildJourneyLayout(analysis, runEngine(analysis));

test("lanes follow the order environments first appear, ignoring stray whitespace", () => {
  assert.deepEqual(layout.lanes.map((lane) => lane.environment), ["Canvas", "PhET"]);
  assert.deepEqual(layout.nodes.map((node) => node.laneIndex), [0, 1, 1, 0, 0]);
});

test("nodes advance one column per step and share a row within a lane", () => {
  const xs = layout.nodes.map((node) => node.x);
  assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]));
  assert.equal(layout.nodes[0].y, layout.nodes[3].y);
  assert.notEqual(layout.nodes[0].y, layout.nodes[1].y);
});

test("a flow edge switches lane exactly when the environment changes", () => {
  assert.deepEqual(layout.flowEdges.map((edge) => edge.switchesLane), [true, false, true, false]);
});

test("memory edges come only from carried items, never from information that stays visible", () => {
  assert.deepEqual(layout.memoryEdges.map((edge) => edge.item).sort(), ["trial_1", "trial_2"]);
  assert.ok(layout.memoryEdges.every((edge) => edge.fromId === "s2" && edge.toId === "s4"));
  assert.ok(layout.memoryEdges.every((edge) => edge.decayRisk));
  assert.equal(layout.memoryEdges[0].label.includes("_"), false);
});

test("overlapping memory spans are stacked on separate rows", () => {
  const ys = new Set(layout.memoryEdges.map((edge) => edge.y));
  assert.equal(ys.size, layout.memoryEdges.length);
  assert.ok(layout.memoryTrackTop !== null && layout.memoryEdges.every((edge) => edge.y > layout.lanesBottom));
});

test("a timer covers the first to last step it names and ignores unknown ids", () => {
  assert.equal(layout.timers.length, 1);
  const [timer] = layout.timers;
  assert.equal(timer.x1, layout.nodes[3].x);
  assert.equal(timer.x2, layout.nodes[4].x + NODE_W);
  assert.ok(timer.y < layout.lanesTop);
});

test("the canvas is large enough to hold every node", () => {
  for (const node of layout.nodes) {
    assert.ok(node.x + NODE_W <= layout.width);
  }
  assert.ok(layout.height >= layout.lanesBottom);
});
