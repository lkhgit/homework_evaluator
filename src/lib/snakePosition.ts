export function snakePosition(index: number, columns: number) {
  const row = Math.floor(index / columns);
  const offset = index % columns;
  return {
    row,
    column: row % 2 === 0 ? offset : columns - 1 - offset,
    direction: offset === columns - 1 ? "down" : row % 2 === 0 ? "right" : "left",
  } as const;
}
