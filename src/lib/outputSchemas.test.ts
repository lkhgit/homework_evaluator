import assert from "node:assert/strict";
import { test } from "node:test";

import { z, type ZodType } from "zod";

import {
  analysisSchema,
  objectiveExtractionSchema,
  repairProposalsSchema,
  repairSchema,
  revisedAssignmentSchema,
  taskGraphSchema,
} from "./schema";

/**
 * Structured-output APIs compile the schema into something with its own size
 * limit, and Anthropic's rejected the whole task graph in a single request —
 * which is why /api/analyze is split into two passes. Gemini's limit is not
 * published either, so rather than guess a new magic number this just checks
 * the property that made the split necessary in the first place: the full
 * analysis is meaningfully bigger than either piece actually sent to the
 * model, and the repair shape stays out of pass one.
 */
function nodeCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + nodeCount(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce<number>((sum, item) => sum + nodeCount(item), 1);
  }
  return 1;
}

function sizeOf(schema: ZodType): number {
  return nodeCount(z.toJSONSchema(schema));
}

// Every schema passed as responseJsonSchema anywhere in the app.
const SENT_TO_THE_MODEL: Array<[string, ZodType]> = [
  ["objectiveExtractionSchema", objectiveExtractionSchema],
  ["taskGraphSchema", taskGraphSchema],
  ["repairProposalsSchema", repairProposalsSchema],
  ["repairSchema", repairSchema],
  ["revisedAssignmentSchema", revisedAssignmentSchema],
];

const analysisSize = sizeOf(analysisSchema);

for (const [name, schema] of SENT_TO_THE_MODEL) {
  test(`${name} stays smaller than the full analysis`, () => {
    const size = sizeOf(schema);
    assert.ok(
      size < analysisSize,
      `${name} compiled to ${size} nodes, no smaller than the ${analysisSize}-node full analysis it is supposed to be a piece of.`
    );
  });
}

test("the full analysis is assembled locally, never requested in one call", () => {
  // Kept as a reminder of why the split exists. If either pass is ever
  // enlarged to cover the whole analysisSchema shape, the split can be
  // reconsidered — but not silently.
  assert.equal(
    "repair" in (taskGraphSchema.shape.steps.element.shape as Record<string, unknown>),
    false,
    "the repair must stay out of pass one, which is what the two-pass split relies on"
  );
});
