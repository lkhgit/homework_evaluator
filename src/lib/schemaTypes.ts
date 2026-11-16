/**
 * The app's data types and the small runtime helpers client code needs,
 * without zod. Every type here is a type-only import from ./schema, which the
 * compiler erases, so importing this module never ships zod to the browser.
 * Server routes validate with the zod schemas in ./schema directly.
 */
import type { RepairEffects } from "./schema";

export type {
  Analysis,
  BarrierType,
  Demands,
  FrictionMoment,
  GoalRelevance,
  ObjectiveCandidate,
  Repair,
  RepairEffects,
  RevisedAssignment,
  Step,
  TimeConstraint,
} from "./schema";

export interface TimeConstraintChange {
  constraintId: string;
  action: "remove" | "set_limit";
  limitMinutes: number | null;
}

/**
 * The timer change a repair states, as a list so callers can treat "no timer
 * touched" and "one timer touched" the same way. The schema carries the fields
 * flat to keep the compiled grammar small; this is the shape to reason with.
 */
export function timeConstraintChangesOf(effects: RepairEffects): TimeConstraintChange[] {
  if (!effects.timeConstraintId || effects.timeConstraintAction === null) return [];
  return [
    {
      constraintId: effects.timeConstraintId,
      action: effects.timeConstraintAction,
      limitMinutes: effects.timeConstraintLimitMinutes,
    },
  ];
}
