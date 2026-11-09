import assert from "node:assert/strict";
import { test } from "node:test";

import { layoutPrerequisiteTree, TREE_NODE_W, TREE_NODE_H } from "./prerequisiteLayout";
import type { Step } from "./schema";
import { buildStudentGuide } from "./studentGuide";
import { escapeHtml, renderStudentHtml } from "./studentHtml";

function step(id: string, requires: string[], extra: Partial<Step> = {}): Step {
  return {
    id,
    action: `Does ${id}`,
    environment: "Canvas",
    produces: [],
    consumes: [],
    requires,
    producedInfoStaysVisible: true,
    estimatedMinutes: null,
    evidence: `original ${id}`,
    goalRelevance: "unknown",
    relevanceReason: "",
    repair: null,
    demands: {
      workingMemory: 0, fineMotor: 0, timePressure: 0, readingLoad: 0, contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false }, communication: "none", wordCount: 0,
    },
    ...extra,
  };
}

// a -> b -> d, a -> c -> d, and d also (redundantly) names a. e stands alone.
const steps = [
  step("a", []),
  step("b", ["a"]),
  step("c", ["a", "later"]),
  step("d", ["b", "c", "a", "d"]),
  step("e", []),
];

const guide = buildStudentGuide({
  title: "Lab",
  objective: "Explain diffusion",
  revisedText: "Open the lab. Run trial b.",
  stepExcerpts: [{ stepId: "b", excerpt: "Run trial b." }],
  steps,
  appliedSuggestions: new Map([["c", "Use the table."]]),
});
const byId = new Map(guide.steps.map((s) => [s.id, s]));

test("excerpts prefer the revised text, then the accepted repair, then the original", () => {
  assert.deepEqual([byId.get("b")!.excerptSource, byId.get("c")!.excerptSource, byId.get("a")!.excerptSource], ["revised", "repair", "original"]);
  assert.equal(byId.get("b")!.excerpt, "Run trial b.");
});

test("prerequisites keep only earlier steps and never the step itself", () => {
  assert.deepEqual(byId.get("c")!.prerequisites, ["a"]);
  assert.deepEqual(byId.get("d")!.prerequisites, ["a", "b", "c"]);
});

test("tree edges drop a prerequisite another prerequisite already depends on", () => {
  assert.deepEqual(byId.get("d")!.treeParents, ["b", "c"]);
});

test("dependents, ancestors and descendants are derived from the same relation", () => {
  assert.deepEqual(byId.get("a")!.dependents, ["b", "c", "d"]);
  assert.deepEqual(byId.get("d")!.ancestors, ["a", "b", "c"]);
  assert.deepEqual(byId.get("a")!.descendants, ["b", "c", "d"]);
  assert.deepEqual(byId.get("e")!.ancestors, []);
});

const layout = layoutPrerequisiteTree(guide);
const node = new Map(layout.nodes.map((n) => [n.id, n]));

test("a step sits one column right of its deepest prerequisite", () => {
  assert.deepEqual(["a", "b", "c", "d", "e"].map((id) => node.get(id)!.depth), [0, 1, 1, 2, 0]);
  assert.equal(layout.columns, 3);
  assert.equal(layout.edges.length, 4);
});

test("every node fits on the canvas without overlapping another", () => {
  for (const n of layout.nodes) {
    assert.ok(n.x + TREE_NODE_W <= layout.width && n.y + TREE_NODE_H <= layout.height);
  }
  const slots = new Set(layout.nodes.map((n) => `${n.depth}:${n.row}`));
  assert.equal(slots.size, layout.nodes.length);
});

test("text from the assignment or the model can never become markup", () => {
  const hostile = buildStudentGuide({
    title: `<img src=x onerror=alert(1)>`,
    objective: `"quoted" & 'single'`,
    revisedText: "</script><script>alert(1)</script>",
    stepExcerpts: [{ stepId: "a", excerpt: "</script><b>x</b>" }],
    steps: [step("a", [], { action: "</script><script>alert(2)</script>" })],
    appliedSuggestions: new Map(),
  });
  const html = renderStudentHtml(hostile);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal((html.match(/<script/g) ?? []).length, 2, "only the template's own two script tags");
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2);
  assert.ok(html.includes(escapeHtml(`"quoted" & 'single'`)));
});

test("the handout is self-contained and lists every step without script", () => {
  const html = renderStudentHtml(guide);
  assert.equal(/(src|href)=["']https?:/i.test(html), false);
  for (const s of guide.steps) {
    assert.ok(html.includes(`data-id="${s.id}"`));
    assert.ok(html.includes(`id="list-${s.id}"`));
  }
});
