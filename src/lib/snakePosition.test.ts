import test from "node:test";
import assert from "node:assert/strict";
import { snakePosition } from "./snakePosition";

test("steps snake across rows and every next step remains adjacent", () => {
  for (const columns of [1, 2, 3]) {
    const positions = Array.from({ length: 20 }, (_, i) => snakePosition(i, columns));
    assert.equal(new Set(positions.map(p => `${p.row}:${p.column}`)).size, positions.length);
    positions.slice(1).forEach((position, i) => {
      const previous = positions[i];
      assert.equal(Math.abs(position.row - previous.row) + Math.abs(position.column - previous.column), 1);
      assert.equal(previous.direction, position.row > previous.row ? "down" : position.column > previous.column ? "right" : "left");
    });
  }
});
