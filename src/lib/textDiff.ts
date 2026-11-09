/**
 * Word-level comparison of the original assignment and its rewrite, so the
 * preview can show exactly which words changed. Done locally rather than asked
 * of the model: a model-reported list of changes can miss or invent edits, a
 * diff of the two texts cannot.
 */

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface TextDiff {
  original: DiffSegment[];
  revised: DiffSegment[];
}

/** Above this many token comparisons the table is too large to build in the browser. */
const MAX_CELLS = 6_000_000;

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "");
}

const isSpace = (token: string) => /^\s+$/.test(token);

/** Joins tokens into segments; whitespace between two changed words stays inside the highlight. */
function toSegments(tokens: string[], changed: boolean[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  const push = (text: string, isChanged: boolean) => {
    const last = segments[segments.length - 1];
    if (last && last.changed === isChanged) last.text += text;
    else segments.push({ text, changed: isChanged });
  };

  tokens.forEach((token, index) => {
    if (isSpace(token) && !changed[index]) {
      // A gap is part of the highlight only when changed words sit on both sides of it.
      let before = index - 1;
      while (before >= 0 && isSpace(tokens[before])) before--;
      let after = index + 1;
      while (after < tokens.length && isSpace(tokens[after])) after++;
      const between = before >= 0 && after < tokens.length && changed[before] && changed[after];
      push(token, between && !token.includes("\n"));
      return;
    }
    push(token, changed[index]);
  });
  return segments;
}

/** Returns null when the texts are too large to compare, so the caller can skip highlighting. */
export function diffWords(original: string, revised: string): TextDiff | null {
  const a = tokenize(original);
  const b = tokenize(revised);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;

  // Longest common subsequence over the part that differs, comparing words only.
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[start + i] === b[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const changedA = new Array<boolean>(a.length).fill(false);
  const changedB = new Array<boolean>(b.length).fill(false);
  const markA = (index: number) => {
    changedA[index] = !isSpace(a[index]);
  };
  const markB = (index: number) => {
    changedB[index] = !isSpace(b[index]);
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      markA(start + i);
      i++;
    } else {
      markB(start + j);
      j++;
    }
  }
  for (; i < n; i++) markA(start + i);
  for (; j < m; j++) markB(start + j);

  return { original: toSegments(a, changedA), revised: toSegments(b, changedB) };
}
