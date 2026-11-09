import type { StudentGuide } from "./studentGuide";

/**
 * Lays the prerequisite tree out left to right. A step's column is how deep
 * its prerequisite chain runs, so everything a step depends on sits to its
 * left. Prerequisites only ever point at earlier steps, so one pass in step
 * order settles every depth.
 */

export const TREE_NODE_W = 210;
export const TREE_NODE_H = 104;
const COL_GAP = 64;
const ROW_GAP = 18;
const PAD = 20;

export interface TreeNode {
  id: string;
  depth: number;
  row: number;
  x: number;
  y: number;
}

export interface TreeEdge {
  from: string;
  to: string;
  path: string;
}

export interface TreeLayout {
  nodes: TreeNode[];
  edges: TreeEdge[];
  columns: number;
  width: number;
  height: number;
}

export function layoutPrerequisiteTree(guide: StudentGuide): TreeLayout {
  const depth = new Map<string, number>();
  for (const step of guide.steps) {
    const parents = step.treeParents.filter((id) => depth.has(id));
    depth.set(step.id, parents.length === 0 ? 0 : 1 + Math.max(...parents.map((id) => depth.get(id)!)));
  }

  const columns = guide.steps.length === 0 ? 0 : Math.max(...depth.values()) + 1;
  const rowOf = new Map<string, number>();
  let maxRows = 0;

  for (let column = 0; column < columns; column++) {
    const members = guide.steps.filter((step) => depth.get(step.id) === column);
    // Order each column by where its parents sit, which keeps most edges from crossing.
    const weight = (stepIndex: number) => {
      const parents = members[stepIndex].treeParents.filter((id) => rowOf.has(id));
      if (parents.length === 0) return Number.POSITIVE_INFINITY;
      return parents.reduce((sum, id) => sum + rowOf.get(id)!, 0) / parents.length;
    };
    const ordered = members
      .map((step, index) => ({ step, key: weight(index) }))
      .sort((a, b) => (a.key === b.key ? a.step.number - b.step.number : a.key - b.key));
    ordered.forEach(({ step }, row) => rowOf.set(step.id, row));
    maxRows = Math.max(maxRows, ordered.length);
  }

  const nodes: TreeNode[] = guide.steps.map((step) => {
    const d = depth.get(step.id)!;
    const row = rowOf.get(step.id)!;
    return {
      id: step.id,
      depth: d,
      row,
      x: PAD + d * (TREE_NODE_W + COL_GAP),
      y: PAD + row * (TREE_NODE_H + ROW_GAP),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edges: TreeEdge[] = guide.steps.flatMap((step) =>
    step.treeParents.flatMap((parentId) => {
      const from = nodeById.get(parentId);
      const to = nodeById.get(step.id);
      if (!from || !to) return [];
      const x1 = from.x + TREE_NODE_W;
      const y1 = from.y + TREE_NODE_H / 2;
      const x2 = to.x;
      const y2 = to.y + TREE_NODE_H / 2;
      const bend = Math.max(24, (x2 - x1) / 2);
      return [{ from: parentId, to: step.id, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }];
    }),
  );

  return {
    nodes,
    edges,
    columns,
    width: columns === 0 ? PAD * 2 : PAD * 2 + columns * TREE_NODE_W + (columns - 1) * COL_GAP,
    height: maxRows === 0 ? PAD * 2 : PAD * 2 + maxRows * TREE_NODE_H + (maxRows - 1) * ROW_GAP,
  };
}
