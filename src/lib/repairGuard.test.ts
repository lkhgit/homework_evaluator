import assert from "node:assert/strict";
import { test } from "node:test";

import { BIOLOGY_SAMPLE } from "@/samples/biology";
import { parseRepairShape } from "./repairGuard";
import { repairSchema } from "./schema";

// The browser uses parseRepairShape instead of repairSchema; both must give
// the same verdict and the same parsed value on every fixture.
const valid = BIOLOGY_SAMPLE.analysis.steps.flatMap((step) => (step.repair ? [step.repair] : []));
const base = valid[0];
const effects = base.effects;

const invalid: unknown[] = [
  null,
  undefined,
  "repair",
  [],
  42,
  {},
  { ...base, suggestion: 1 },
  { ...base, barrierReduced: undefined },
  { ...base, rigorPreserved: "yes" },
  { ...base, rigorNote: null },
  { ...base, effects: null },
  { ...base, effects: [] },
  { ...base, effects: { ...effects, keepsInfoVisible: "true" } },
  { ...base, effects: { ...effects, addsNonColorCue: undefined } },
  { ...base, effects: { ...effects, timeConstraintAction: "extend" } },
  { ...base, effects: { ...effects, timeConstraintId: 7 } },
  { ...base, effects: { ...effects, timeConstraintLimitMinutes: "10" } },
  { ...base, effects: { ...effects, timeConstraintLimitMinutes: Number.NaN } },
  { ...base, effects: { ...effects, timeConstraintLimitMinutes: Number.POSITIVE_INFINITY } },
  { ...base, effects: { ...effects, timeConstraintLimitMinutes: Number.NEGATIVE_INFINITY } },
  { ...base, effects: { ...effects, replacementEnvironment: false } },
];

const edgeValid: unknown[] = [
  ...valid,
  { ...base, extra: "dropped" },
  { ...base, effects: { ...effects, extra: true } },
  { ...base, suggestion: "" },
  { ...base, effects: { ...effects, timeConstraintId: "t", timeConstraintAction: "set_limit", timeConstraintLimitMinutes: 30 } },
  { ...base, effects: { ...effects, timeConstraintLimitMinutes: -1 } },
];

test("the guard accepts exactly what repairSchema accepts, with the same result", () => {
  for (const fixture of edgeValid) {
    const zod = repairSchema.safeParse(fixture);
    assert.equal(zod.success, true, JSON.stringify(fixture));
    assert.deepEqual(parseRepairShape(fixture), zod.success ? zod.data : null);
  }
});

test("the guard rejects exactly what repairSchema rejects", () => {
  for (const fixture of invalid) {
    assert.equal(repairSchema.safeParse(fixture).success, false, `zod accepted ${String(JSON.stringify(fixture))}`);
    assert.equal(parseRepairShape(fixture), null, `guard accepted ${String(JSON.stringify(fixture))}`);
  }
});
