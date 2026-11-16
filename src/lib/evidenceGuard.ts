import type { Analysis } from "./schema";

/**
 * A quote the educator can check is the difference between a barrier trace and
 * a plausible-sounding paragraph. Anything the model did not copy verbatim from
 * the source is blanked here rather than rendered, so the interface can never
 * show an educator a sentence their assignment does not contain.
 *
 * Verification and highlighting share one matcher. They used to normalise
 * differently, so a quote with straight quotes against a source with curly ones
 * was "verified" and then could not be found to highlight.
 */

const SINGLE_QUOTES = /[‘’‚‛′]/g;
const DOUBLE_QUOTES = /[“”„‟″]/g;

/** Canonical form of one grapheme: NFC, lower case, typographic quotes folded. */
function canonical(grapheme: string): string {
  return grapheme
    .normalize("NFC")
    .toLowerCase()
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"');
}

function graphemes(value: string): Array<{ segment: string; index: number }> {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  }
  return Array.from(value, (segment, index) => ({ segment, index }));
}

export interface NormalizedText {
  text: string;
  /** For each character of `text`, the source range it came from. */
  starts: number[];
  ends: number[];
}

/**
 * Normalises text while remembering where every normalised character came
 * from, so a match found in normalised form maps back to the exact original
 * characters. Runs of whitespace collapse to one space; NFD Hangul from a PDF
 * or macOS copy compares equal to NFC.
 */
function normalizeWithMap(value: string): NormalizedText {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of graphemes(value)) {
    const end = index + segment.length;
    if (/^\s+$/u.test(segment)) {
      if (text.length === 0 || text.endsWith(" ")) continue;
      text += " ";
      starts.push(index);
      ends.push(end);
      continue;
    }
    for (const char of canonical(segment)) {
      text += char;
      for (let i = 0; i < char.length; i++) {
        starts.push(index);
        ends.push(end);
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { text, starts, ends };
}

export function normalizeEvidence(value: string): string {
  return normalizeWithMap(value).text;
}

/**
 * Where a quote sits in the source, tolerant only of case, Unicode
 * normalisation form, typographic quotes and whitespace. Null when absent.
 */
export function findEvidenceSpan(
  source: string | NormalizedText,
  evidence: string
): { start: number; end: number } | null {
  const needle = normalizeEvidence(evidence);
  if (needle.length === 0) return null;
  // verifyEvidence passes the source pre-normalised: one pass per call, not per quote.
  const haystack = typeof source === "string" ? normalizeWithMap(source) : source;
  const at = haystack.text.indexOf(needle);
  if (at === -1) return null;
  return { start: haystack.starts[at], end: haystack.ends[at + needle.length - 1] };
}

/**
 * Whether a quote is long enough to ground anything. "the" or "." appear in
 * almost every assignment, so finding them proves nothing. Hangul and other
 * CJK characters carry more per character than Latin letters and count double.
 * A quote containing a digit needs only two characters, so a short timer clause
 * such as "20분" or "10 min" still counts: it names the very fact it grounds.
 */
export function isMeaningfulEvidence(evidence: string): boolean {
  const characters = [...evidence.normalize("NFC")].filter((char) => /[\p{L}\p{N}]/u.test(char));
  if (characters.some((char) => /\p{N}/u.test(char))) return characters.length >= 2;
  const weight = characters.reduce(
    (sum, char) =>
      sum + (/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char) ? 2 : 1),
    0
  );
  return weight >= 6;
}

export type EvidenceRejection = "missing" | "too_short";

/** Why a quote cannot be used, or null when it can. */
export function evidenceProblem(source: string | NormalizedText, evidence: string): EvidenceRejection | null {
  if (findEvidenceSpan(source, evidence) === null) return "missing";
  if (!isMeaningfulEvidence(evidence)) return "too_short";
  return null;
}

export interface EvidenceCheck {
  analysis: Analysis;
  verified: number;
  discarded: number;
  /** Of the discarded quotes, how many were present but too short to ground anything. */
  discardedTooShort: number;
  discardedStepIds: string[];
  discardedConstraintIds: string[];
}

export function verifyEvidence(analysis: Analysis, assignmentText: string): EvidenceCheck {
  const discardedStepIds: string[] = [];
  const discardedConstraintIds: string[] = [];
  let verified = 0;
  let discardedTooShort = 0;
  const source = normalizeWithMap(assignmentText);

  const accept = (evidence: string): boolean => {
    const problem = evidenceProblem(source, evidence);
    if (problem === null) {
      verified++;
      return true;
    }
    if (problem === "too_short") discardedTooShort++;
    return false;
  };

  const steps = analysis.steps.map((step) => {
    if (accept(step.evidence)) return step;
    discardedStepIds.push(step.id);
    return { ...step, evidence: "" };
  });

  const timeConstraints = analysis.timeConstraints.map((constraint) => {
    if (accept(constraint.evidence)) return constraint;
    discardedConstraintIds.push(constraint.id);
    return { ...constraint, evidence: "" };
  });

  return {
    analysis: { ...analysis, steps, timeConstraints },
    verified,
    discarded: discardedStepIds.length + discardedConstraintIds.length,
    discardedTooShort,
    discardedStepIds,
    discardedConstraintIds,
  };
}

/**
 * Locates a verified quote inside the source so the UI can highlight it in
 * place. Returns null when the quote is absent, which callers must treat as
 * "render without a highlight" rather than falling back to a search string.
 */
export function locateEvidence(
  assignmentText: string,
  evidence: string
): { start: number; end: number } | null {
  if (!evidence) return null;
  const direct = assignmentText.indexOf(evidence);
  if (direct !== -1) return { start: direct, end: direct + evidence.length };
  return findEvidenceSpan(assignmentText, evidence);
}
