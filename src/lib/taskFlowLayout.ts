/** Each column follows task order. A lane is reused when a task returns to it. */
export function taskFlowLayout(categories: readonly string[]) {
  const lanes = [...new Set(categories)];
  const laneByCategory = new Map(lanes.map((label, index) => [label, index]));
  const rows = categories.map(category => laneByCategory.get(category)!);

  return {
    lanes,
    steps: rows.map((row, index) => ({
      row,
      nextRow: rows[index + 1] as number | undefined,
    })),
  };
}
