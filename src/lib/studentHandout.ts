import type { RevisedAssignment, Step } from "./schema";
import { buildStudentGuide } from "./studentGuide";
import { renderStudentHtml } from "./studentHtml";

export interface StudentHandoutInput {
  revised: RevisedAssignment;
  objective: string;
  /** Steps as analysed, still carrying the repairs the educator accepted. */
  originalSteps: readonly Step[];
  /** The same steps with the accepted repairs applied. */
  repairedSteps: readonly Step[];
  appliedRepairIds: readonly string[];
}

/** The finished student HTML, built only from validated data and the fixed template. */
export function buildStudentHandout(input: StudentHandoutInput): string {
  const applied = new Set(input.appliedRepairIds);
  const appliedSuggestions = new Map(
    input.originalSteps
      .filter((step) => applied.has(step.id) && step.repair)
      .map((step) => [step.id, step.repair!.suggestion]),
  );
  const guide = buildStudentGuide({
    title: input.revised.title,
    objective: input.objective,
    revisedText: input.revised.revisedText,
    stepExcerpts: input.revised.stepExcerpts ?? [],
    steps: input.repairedSteps,
    appliedSuggestions,
  });
  return renderStudentHtml(guide);
}

export function downloadHtml(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Keeps Korean and other letters, so a Korean title does not collapse to a generic name. */
export function handoutFilename(title: string): string {
  const slug = title
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "assignment"}-학생용.html`;
}
