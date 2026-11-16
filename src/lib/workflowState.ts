import { repairTargetsFinding } from "./repairs";
import { checkRevision, type RevisionCheck } from "./revisionCheck";
import { parseRepairShape } from "./repairGuard";
import type { Analysis, FrictionMoment, Repair, RevisedAssignment, Step } from "./schemaTypes";
import { buildStudentHandout, type StudentHandout } from "./studentHandout";

/**
 * Workflow decisions that sit on data or async boundaries, kept out of the page
 * component so they can be tested without rendering it.
 */

/** A repair from the network is checked before it can change the graph. */
export function parseRepair(value: unknown): Repair | null {
  // A zod-free guard kept in step with repairSchema by repairGuard.test.ts,
  // so this browser-side check does not ship zod.
  return parseRepairShape(value);
}

/** Only a step that actually carries a proposal can be accepted. */
export function canAcceptRepair(steps: readonly Step[], stepId: string): boolean {
  return steps.some((step) => step.id === stepId && step.repair !== null);
}

export type CustomRepairOutcome =
  | { status: "stale" }
  | { status: "invalid" }
  | { status: "missing-step" }
  | { status: "accepted"; repair: Repair };

/**
 * Decides what a custom-repair reply may do once it arrives.
 *
 * The reply is pinned to the analysis it was asked about. Step ids repeat
 * across analyses, so a reply that lands after a new analysis or a fresh start
 * must be dropped rather than attached to a step that merely shares its id.
 */
export function resolveCustomRepair(input: {
  requestToken: number;
  currentToken: number;
  steps: readonly Step[];
  stepId: string;
  response: unknown;
}): CustomRepairOutcome {
  if (input.requestToken !== input.currentToken) return { status: "stale" };
  const repair = parseRepair(input.response);
  if (!repair) return { status: "invalid" };
  if (!input.steps.some((step) => step.id === input.stepId)) return { status: "missing-step" };
  return { status: "accepted", repair };
}

/** Replaces one step's proposal, leaving every other step as it is now. */
export function withRepair(steps: readonly Step[], stepId: string, repair: Repair): Step[] {
  return steps.map((step) => (step.id === stepId ? { ...step, repair } : step));
}

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

/** Whether editing the objective makes results judged against the old one stale. */
export function objectiveChanged(next: string, analyzed: string): boolean {
  return collapse(next) !== collapse(analyzed);
}

/** First non-empty line, used to name an export of the unchanged original. */
export function titleOf(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 120) ?? "과제";
}

/**
 * What to do with a PDF's text once extraction finishes. Reading can take
 * seconds, and the educator may have typed in the box meanwhile or picked
 * another file; replacing the box then would silently discard their work.
 */
export function pdfResultAction(input: {
  requestToken: number;
  currentToken: number;
  mounted: boolean;
  editsAtStart: number;
  editsNow: number;
}): "ignore" | "apply" | "offer" {
  if (!input.mounted || input.requestToken !== input.currentToken) return "ignore";
  return input.editsNow === input.editsAtStart ? "apply" : "offer";
}

/**
 * The step a finding is shown against, and whether its repair is one that
 * addresses that finding. A step with a repair for a different barrier is
 * still shown for its evidence, but its repair is not offered as the fix.
 */
export function stepForFriction(
  analysis: Analysis,
  friction: FrictionMoment
): { step: Step; repairRelevant: boolean } | null {
  const matched = friction.stepIds
    .map((stepId) => analysis.steps.find((step) => step.id === stepId))
    .filter((step): step is Step => Boolean(step));
  const relevant = matched.find((step) => repairTargetsFinding(analysis, friction, step));
  if (relevant) return { step: relevant, repairRelevant: true };
  return matched[0] ? { step: matched[0], repairRelevant: false } : null;
}

export interface Deliverable {
  kind: "original" | "revised";
  title: string;
  body: string;
  handout: StudentHandout;
  /** Local text comparison; only a rewrite has something to compare. */
  check: RevisionCheck | null;
}

/**
 * What the educator can hand out right now, derived in one place for the
 * preview, completion screen and both exports. With no accepted repair it is
 * the original, unchanged; with accepted repairs it exists only once the
 * matching rewrite does.
 */
export function deliverableFor(input: {
  originalText: string;
  objective: string;
  acceptedSteps: readonly Step[];
  revision: RevisedAssignment | null;
  timeConstraints: Analysis["timeConstraints"];
}): Deliverable | null {
  const accepted = input.acceptedSteps.filter((step) => step.repair !== null);
  if (accepted.length === 0) {
    const title = titleOf(input.originalText);
    return {
      kind: "original",
      title,
      body: input.originalText,
      handout: buildStudentHandout({ title, body: input.originalText, objective: input.objective }),
      check: null,
    };
  }
  if (!input.revision) return null;
  const { title, revisedText } = input.revision;
  return {
    kind: "revised",
    title,
    body: revisedText,
    handout: buildStudentHandout({ title, body: revisedText, objective: input.objective }),
    check: checkRevision({
      originalText: input.originalText,
      revisedText,
      objective: input.objective,
      acceptedSteps: accepted,
      timeConstraints: input.timeConstraints,
    }),
  };
}

/**
 * A stored rewrite is used only for the exact inputs it was generated from:
 * the same text, objective and accepted repairs. After any change it is
 * stale, and nothing downstream may show, hand out or export it.
 */
export function revisionFor<T>(stored: { key: string; value: T } | null, currentKey: string): T | null {
  return stored?.key === currentKey ? stored.value : null;
}

/**
 * Keys for the session-only memo of model answers. Text is compared in NFC
 * (macOS pastes NFD Hangul), with line endings unified and spaces within a
 * line collapsed. Line breaks themselves are kept: they decide paragraphs,
 * lists and indented continuations in the student handout, so a resubmit
 * that only re-wraps lines is a new assignment. Nothing is persisted: the
 * memo lives as long as the page.
 */
export function assignmentKey(text: string): string {
  return text
    .normalize("NFC")
    .split(/\r\n?|\n/)
    .map((line) => line.replace(/[ \t ]+/g, " ").replace(/ $/, ""))
    .join("\n")
    .trim();
}

export function analysisKey(text: string, objective: string): string {
  return `${assignmentKey(text)}\u0000${assignmentKey(objective)}`;
}

/**
 * What locking an objective should do. Unchanged text and objective return to
 * the results on screen with every decision kept; a remembered answer is
 * reused (a new graph, so decisions reset); otherwise the model is asked.
 * `force` (다시 분석) always asks.
 */
export function lockDecision(input: {
  key: string;
  currentKey: string;
  objectiveChangedSinceAnalysis: boolean;
  remembered: boolean;
  force: boolean;
}): "show-current" | "use-remembered" | "request" {
  if (input.force) return "request";
  if (input.key === input.currentKey && !input.objectiveChangedSinceAnalysis) return "show-current";
  return input.remembered ? "use-remembered" : "request";
}

/**
 * Attaches repair proposals that arrived after the graph. Steps without a
 * proposal keep none; a proposal for a step the graph does not have is
 * ignored (the server already reported it).
 */
export function mergeRepairs(steps: readonly Step[], repairs: Readonly<Record<string, Repair>>): Step[] {
  return steps.map((step) => ({ ...step, repair: repairs[step.id] ?? null }));
}

export type RepairsStatus =
  | { key: string; state: "loading" }
  | { key: string; state: "ready" }
  | { key: string; state: "failed"; message: string };

/** The repairs status for the analysis on screen; anything keyed to another analysis is ignored. */
export function repairsStatusFor(status: RepairsStatus | null, currentKey: string): RepairsStatus["state"] | "failed" | "loading" {
  if (!status || status.key !== currentKey) return "loading";
  return status.state;
}
