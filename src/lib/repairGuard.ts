import type { Repair, RepairEffects } from "./schemaTypes";

/**
 * A hand-written check of the repair shape, for the browser. It mirrors
 * repairSchema in ./schema so the client does not ship zod for this one
 * check; repairGuard.test.ts runs both on the same fixtures to keep them in
 * step. Like zod's default object parsing, unknown keys are dropped.
 */

const BOOLEAN_EFFECTS = [
  "keepsInfoVisible",
  "reducesWorkingMemory",
  "reducesFineMotor",
  "reducesReadingLoad",
  "addsNonColorCue",
  "addsCaptionOrTranscript",
  "addsResponseAlternative",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";
// zod 4's z.number() accepts only finite numbers: NaN and both infinities fail.
const numberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

function parseEffects(value: unknown): RepairEffects | null {
  if (!isRecord(value)) return null;
  for (const key of BOOLEAN_EFFECTS) if (typeof value[key] !== "boolean") return null;
  const action = value.timeConstraintAction;
  if (!(action === null || action === "remove" || action === "set_limit")) return null;
  if (!stringOrNull(value.timeConstraintId)) return null;
  if (!numberOrNull(value.timeConstraintLimitMinutes)) return null;
  if (!stringOrNull(value.replacementEnvironment)) return null;
  return {
    keepsInfoVisible: value.keepsInfoVisible as boolean,
    reducesWorkingMemory: value.reducesWorkingMemory as boolean,
    reducesFineMotor: value.reducesFineMotor as boolean,
    timeConstraintId: value.timeConstraintId,
    timeConstraintAction: action,
    timeConstraintLimitMinutes: value.timeConstraintLimitMinutes,
    reducesReadingLoad: value.reducesReadingLoad as boolean,
    addsNonColorCue: value.addsNonColorCue as boolean,
    addsCaptionOrTranscript: value.addsCaptionOrTranscript as boolean,
    addsResponseAlternative: value.addsResponseAlternative as boolean,
    replacementEnvironment: value.replacementEnvironment,
  };
}

export function parseRepairShape(value: unknown): Repair | null {
  if (!isRecord(value)) return null;
  if (typeof value.suggestion !== "string") return null;
  if (typeof value.barrierReduced !== "string") return null;
  if (typeof value.rigorPreserved !== "boolean") return null;
  if (typeof value.rigorNote !== "string") return null;
  const effects = parseEffects(value.effects);
  if (!effects) return null;
  return {
    suggestion: value.suggestion,
    effects,
    barrierReduced: value.barrierReduced,
    rigorPreserved: value.rigorPreserved,
    rigorNote: value.rigorNote,
  };
}
