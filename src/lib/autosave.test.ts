import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE, BIOLOGY_TEXT } from "@/samples/biology";
import { parseSnapshot, resumableStage, savedAtLabel, type WorkflowSnapshot } from "./autosave";

const snapshot: WorkflowSnapshot = {
  version: 1,
  savedAt: 1_700_000_000_000,
  stage: "repair",
  assignmentDraft: BIOLOGY_TEXT,
  analyzedText: BIOLOGY_TEXT,
  objective: BIOLOGY_SAMPLE.analysisObjective,
  analyzedObjective: BIOLOGY_SAMPLE.analysisObjective,
  baseAnalysis: BIOLOGY_SAMPLE.analysis,
  steps: BIOLOGY_SAMPLE.analysis.steps,
  appliedRepairIds: ["s5"],
  revisions: { k: { title: "T", revisedText: "Body", changes: [] } as never },
  visited: ["analyze", "goal", "journey", "repair"],
  selectedFrictionId: BIOLOGY_SAMPLE.analysis.frictionMoments[0].id,
  condition: "working_memory",
  currentAnalysisKey: "key",
  repairsReady: true,
};

test("a saved workflow round-trips through JSON", () => {
  assert.deepEqual(parseSnapshot(JSON.stringify(snapshot)), snapshot);
});

test("anything malformed, foreign or from another version is dropped whole", () => {
  for (const raw of [
    null,
    "",
    "{not json",
    "[]",
    JSON.stringify({ ...snapshot, version: 2 }),
    JSON.stringify({ ...snapshot, stage: "nowhere" }),
    JSON.stringify({ ...snapshot, stage: "intro" }),
    JSON.stringify({ ...snapshot, condition: "telepathy" }),
    JSON.stringify({ ...snapshot, steps: [{ id: 1 }] }),
    JSON.stringify({ ...snapshot, baseAnalysis: { steps: [] } }),
    JSON.stringify({ ...snapshot, appliedRepairIds: [1] }),
    JSON.stringify({ ...snapshot, revisions: { k: { title: "T" } } }),
    JSON.stringify({ ...snapshot, repairsReady: "yes" }),
    JSON.stringify({ ...snapshot, objective: undefined }),
  ]) {
    assert.equal(parseSnapshot(raw), null, String(raw).slice(0, 60));
  }
});

test("unknown visited stages are filtered out instead of failing the restore", () => {
  const parsed = parseSnapshot(JSON.stringify({ ...snapshot, visited: ["analyze", "bogus", "journey"] }));
  assert.deepEqual(parsed?.visited, ["analyze", "journey"]);
});

test("transient stages resume at the nearest stable one", () => {
  assert.equal(resumableStage("loading"), "goal");
  assert.equal(resumableStage("intro"), "analyze");
  assert.equal(resumableStage("repair"), "repair");
});

test("saved time reads as a relative Korean label", () => {
  const now = 1_700_000_000_000;
  assert.equal(savedAtLabel(now - 10_000, now), "방금 전");
  assert.equal(savedAtLabel(now - 5 * 60_000, now), "5분 전");
  assert.equal(savedAtLabel(now - 3 * 3_600_000, now), "3시간 전");
});
