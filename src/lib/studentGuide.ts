import type { Step } from "./schema";

/**
 * Everything the student handout needs, assembled from data the app already
 * holds. The model contributed two things upstream — each step's direct
 * prerequisites and a verbatim excerpt of the revised text per step — and
 * both have been validated before they reach here. Nothing in this module is
 * generated; it only joins and derives.
 */

export type ExcerptSource = "revised" | "repair" | "original";

export interface GuideStep {
  id: string;
  number: number;
  action: string;
  environment: string;
  estimatedMinutes: number | null;
  excerpt: string;
  excerptSource: ExcerptSource;
  /** Direct prerequisites as stated: must be finished before this step can start. */
  prerequisites: string[];
  /** Steps that list this one as a direct prerequisite. */
  dependents: string[];
  /** Prerequisites with redundant ones removed, for drawing the tree's edges. */
  treeParents: string[];
  ancestors: string[];
  descendants: string[];
}

export interface StudentGuide {
  title: string;
  objective: string;
  revisedText: string;
  steps: GuideStep[];
}

export interface StudentGuideInput {
  title: string;
  objective: string;
  revisedText: string;
  /** Verified excerpts of revisedText, keyed by step id. */
  stepExcerpts: ReadonlyArray<{ stepId: string; excerpt: string }>;
  /** The steps after accepted repairs have been applied. */
  steps: readonly Step[];
  /** The accepted repair suggestion for each repaired step. */
  appliedSuggestions: ReadonlyMap<string, string>;
}

export function buildStudentGuide(input: StudentGuideInput): StudentGuide {
  const ids = input.steps.map((step) => step.id);
  const position = new Map(ids.map((id, index) => [id, index]));
  const excerptById = new Map(
    input.stepExcerpts
      .filter((entry) => entry.excerpt.trim() !== "")
      .map((entry) => [entry.stepId, entry.excerpt.trim()]),
  );

  // Only earlier, known steps — the normaliser already enforces this, but the
  // handout must never draw a cycle even from data that skipped it.
  const prerequisites = new Map(
    input.steps.map((step, index) => [
      step.id,
      [...new Set(step.requires ?? [])].filter((id) => {
        const at = position.get(id);
        return at !== undefined && at < index;
      }),
    ]),
  );

  const ancestors = new Map<string, Set<string>>();
  for (const id of ids) {
    const all = new Set<string>();
    for (const parent of prerequisites.get(id)!) {
      all.add(parent);
      for (const grand of ancestors.get(parent)!) all.add(grand);
    }
    ancestors.set(id, all);
  }

  const descendants = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const id of ids) {
    for (const ancestor of ancestors.get(id)!) descendants.get(ancestor)!.add(id);
  }

  const dependents = new Map(ids.map((id) => [id, [] as string[]]));
  for (const id of ids) {
    for (const parent of prerequisites.get(id)!) dependents.get(parent)!.push(id);
  }

  const byOrder = (a: string, b: string) => position.get(a)! - position.get(b)!;

  const steps: GuideStep[] = input.steps.map((step, index) => {
    const direct = prerequisites.get(step.id)!;
    // A parent is redundant when another parent already depends on it.
    const treeParents = direct.filter(
      (parent) => !direct.some((other) => other !== parent && ancestors.get(other)!.has(parent)),
    );

    const revised = excerptById.get(step.id);
    const suggestion = input.appliedSuggestions.get(step.id)?.trim();
    const [excerpt, excerptSource]: [string, ExcerptSource] = revised
      ? [revised, "revised"]
      : suggestion
        ? [suggestion, "repair"]
        : [step.evidence.trim(), "original"];

    return {
      id: step.id,
      number: index + 1,
      action: step.action,
      environment: step.environment.trim(),
      estimatedMinutes: step.estimatedMinutes,
      excerpt,
      excerptSource,
      prerequisites: [...direct].sort(byOrder),
      dependents: dependents.get(step.id)!.sort(byOrder),
      treeParents: treeParents.sort(byOrder),
      ancestors: [...ancestors.get(step.id)!].sort(byOrder),
      descendants: [...descendants.get(step.id)!].sort(byOrder),
    };
  });

  return {
    title: input.title,
    objective: input.objective,
    revisedText: input.revisedText,
    steps,
  };
}
