import { strict as assert } from "node:assert";
import test from "node:test";
import { taskFlowLayout } from "./taskFlowLayout";

test("steps stay in order when they switch lanes and return to an earlier environment", () => {
  const layout = taskFlowLayout(["Canvas", "PhET", "PhET", "Canvas", "제출 점검"]);
  assert.deepEqual(layout.lanes, ["Canvas", "PhET", "제출 점검"]);
  assert.deepEqual(layout.steps, [
    { row: 0, nextRow: 1 },
    { row: 1, nextRow: 1 },
    { row: 1, nextRow: 0 },
    { row: 0, nextRow: 2 },
    { row: 2, nextRow: undefined },
  ]);
});
