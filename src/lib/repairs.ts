import { analyzeMemory, analyzeTiming, timerPressesOn } from "./engine";
import { timeConstraintChangesOf } from "./schemaTypes";
import type {
  Analysis,
  BarrierType,
  Demands,
  FrictionMoment,
  RepairEffects,
  Step,
} from "./schema";

export type FrictionStatus = "resolved" | "unresolved" | "unverified";

export interface FrictionResolution {
  frictionId: string;
  status: FrictionStatus;
  reason: string;
}

export interface RepairApplication {
  analysis: Analysis;
  frictionResolutions: FrictionResolution[];
  appliedRepairIds: string[];
}

function applyEffects(demands: Demands, effects: RepairEffects): Demands {
  const next: Demands = { ...demands, sensory: { ...demands.sensory } };
  if (effects.reducesWorkingMemory && next.workingMemory >= 2) next.workingMemory = 1;
  if (effects.reducesFineMotor && next.fineMotor >= 2) next.fineMotor = 1;
  if (effects.reducesReadingLoad && next.readingLoad >= 2) next.readingLoad = 1;
  if (effects.addsNonColorCue) next.sensory.colorOnly = false;
  if (effects.addsCaptionOrTranscript) next.sensory.audioOnly = false;
  if (effects.addsResponseAlternative && next.communication !== "none") {
    next.communication = "multiple";
  }
  return next;
}

function localBarrierPresent(barrier: BarrierType, steps: readonly Step[]): boolean {
  switch (barrier) {
    case "fine_motor":
      return steps.some((step) => step.demands.fineMotor >= 2);
    case "reading_load":
      return steps.some((step) => step.demands.readingLoad >= 2);
    case "single_modality_communication":
      return steps.some(
        (step) =>
          step.demands.communication !== "none" &&
          step.demands.communication !== "multiple"
      );
    case "sensory_color_only":
      return steps.some((step) => step.demands.sensory.colorOnly);
    case "sensory_audio_only":
      return steps.some((step) => step.demands.sensory.audioOnly);
    default:
      return false;
  }
}

/**
 * Whether a memory barrier is still observable at the steps a finding names.
 *
 * A finding is about information carried between the steps it names, so both
 * ends of the carry have to fall inside it. Counting any item that merely
 * touched one of those steps meant an unrelated value passing through kept the
 * finding open after the repair had demonstrably worked: peak load fell from
 * four to one, every value the finding described was visible, and it still
 * reported that the barrier remained.
 */
function memoryPresent(analysis: Analysis, moment: FrictionMoment): boolean {
  const ids = new Set(moment.stepIds);
  const report = analyzeMemory(analysis.steps);
  return (
    report.carried.some(
      (item) =>
        ids.has(item.producedAtStepId) &&
        item.consumedAtStepIds.some((stepId) => ids.has(stepId))
    ) || report.overCapacityStepIds.some((stepId) => ids.has(stepId))
  );
}

export type KeepVisibleTarget = "producer" | "consumer" | "none";

/**
 * What a keep-visible repair can mean on this step.
 *
 * On a step that produces values it keeps them on screen from then on. On a
 * step that only uses earlier values it shows those values at that step: the
 * student no longer brings them there from memory, but any other step that
 * needs them still does. A step that does neither has nothing to keep visible,
 * so the effect changes no measurement there.
 */
export function keepVisibleTarget(step: Step): KeepVisibleTarget {
  if (step.produces.length > 0) return "producer";
  if (step.consumes.length > 0) return "consumer";
  return "none";
}

function contextTransitions(analysis: Analysis, moment: FrictionMoment): number {
  const ids = new Set(moment.stepIds);
  return analysis.steps.filter(
    (step, index) => index > 0 && ids.has(step.id) && step.demands.contextSwitch
  ).length;
}

/**
 * Whether a clock the assignment actually states is still pressing on these
 * steps.
 *
 * Deliberately not the per-step timePressure rating. That rating is the model's
 * impression of a step, and a step can carry it with no stated timer anywhere
 * near it, in which case no timer repair can ever move it and the finding stays
 * open forever. A finding whose steps have no stated timer at all comes back
 * absent here, which resolutionFor already reports as unverified rather than as
 * a barrier that was fixed.
 */
export function timingPresent(analysis: Analysis, moment: FrictionMoment): boolean {
  const ids = new Set(moment.stepIds);
  const timing = analyzeTiming(analysis);
  return analysis.steps.some((step) => ids.has(step.id) && timerPressesOn(step, timing));
}

function barrierPresent(analysis: Analysis, moment: FrictionMoment): boolean | null {
  const ids = new Set(moment.stepIds);
  const steps = analysis.steps.filter((step) => ids.has(step.id));
  switch (moment.barrierType) {
    case "working_memory":
      return memoryPresent(analysis, moment);
    case "context_switching":
      return contextTransitions(analysis, moment) > 0;
    case "time_pressure":
      return timingPresent(analysis, moment);
    case "navigation_ambiguity":
      return null;
    default:
      return localBarrierPresent(moment.barrierType, steps);
  }
}

function relevantEffect(
  source: Analysis,
  repaired: Analysis,
  moment: FrictionMoment,
  effectsByStep: ReadonlyMap<string, RepairEffects>
): boolean {
  const ids = new Set(moment.stepIds);
  const referenced = [...effectsByStep].filter(([stepId]) => ids.has(stepId));
  switch (moment.barrierType) {
    case "working_memory":
      return referenced.some(([stepId, effects]) => {
        const step = source.steps.find((candidate) => candidate.id === stepId);
        const keepsVisible =
          effects.keepsInfoVisible && step !== undefined && keepVisibleTarget(step) !== "none";
        return keepsVisible || effects.reducesWorkingMemory;
      });
    case "context_switching":
      return (
        [...effectsByStep.values()].some(
          (effects) => effects.replacementEnvironment !== null
        ) && contextTransitions(repaired, moment) < contextTransitions(source, moment)
      );
    case "fine_motor":
      return referenced.some(([, effects]) => effects.reducesFineMotor);
    case "reading_load":
      return referenced.some(([, effects]) => effects.reducesReadingLoad);
    case "single_modality_communication":
      return referenced.some(([, effects]) => effects.addsResponseAlternative);
    case "sensory_color_only":
      return referenced.some(([, effects]) => effects.addsNonColorCue);
    case "sensory_audio_only":
      return referenced.some(([, effects]) => effects.addsCaptionOrTranscript);
    case "navigation_ambiguity":
      return referenced.length > 0;
    case "time_pressure": {
      const relevantConstraintIds = new Set(
        source.timeConstraints
          .filter((constraint) => constraint.stepIds.some((stepId) => ids.has(stepId)))
          .map((constraint) => constraint.id)
      );
      return [...effectsByStep.values()].some((effects) =>
        timeConstraintChangesOf(effects).some((change) =>
          relevantConstraintIds.has(change.constraintId)
        )
      );
    }
  }
}

function resolutionFor(
  source: Analysis,
  repaired: Analysis,
  moment: FrictionMoment,
  effectsByStep: ReadonlyMap<string, RepairEffects>
): FrictionResolution {
  const changed = relevantEffect(source, repaired, moment, effectsByStep);
  if (!changed) {
    return {
      frictionId: moment.id,
      status: "unresolved",
      reason: "채택한 개선안 중 이 항목의 측정값을 바꾼 것이 없습니다.",
    };
  }

  const before = barrierPresent(source, moment);
  const after = barrierPresent(repaired, moment);
  if (before === null || after === null) {
    return {
      frictionId: moment.id,
      status: "unverified",
      reason: "개선안은 적용했지만 이 문제는 측정할 수 있는 부담으로 나타나지 않습니다.",
    };
  }
  if (!before) {
    return {
      frictionId: moment.id,
      status: "unverified",
      reason: "원래 단계 분석에 이 항목이 가리키는 측정 조건이 없었습니다.",
    };
  }
  if (after) {
    return {
      frictionId: moment.id,
      status: "unresolved",
      reason: "개선안을 적용한 뒤에도 측정된 조건이 남아 있습니다.",
    };
  }
  return {
    frictionId: moment.id,
    status: "resolved",
    reason: "개선 전에 측정된 조건이 개선 후에는 사라졌습니다.",
  };
}

/** Applies only the effects stated by accepted repairs and verifies outcomes. */
export function applyRepairs(
  source: Analysis,
  appliedStepIds: readonly string[]
): RepairApplication {
  const requested = new Set(appliedStepIds);
  const effectsByStep = new Map<string, RepairEffects>();
  const appliedRepairIds: string[] = [];

  let steps = source.steps.map((step) => {
    if (!requested.has(step.id) || step.repair === null) return step;
    const effects = step.repair.effects;
    effectsByStep.set(step.id, effects);
    appliedRepairIds.push(step.id);
    const target = effects.keepsInfoVisible ? keepVisibleTarget(step) : "none";
    return {
      ...step,
      environment: effects.replacementEnvironment ?? step.environment,
      producedInfoStaysVisible:
        target === "producer" ? true : step.producedInfoStaysVisible,
      ...(target === "consumer"
        ? { referencedItems: [...new Set([...(step.referencedItems ?? []), ...step.consumes])] }
        : {}),
      demands: applyEffects(step.demands, effects),
      repair: null,
    };
  });

  const changes = [...effectsByStep.values()].flatMap(
    (effects) => timeConstraintChangesOf(effects)
  );
  const removedConstraintIds = new Set(
    changes.filter((change) => change.action === "remove").map((change) => change.constraintId)
  );
  // Only a limit that is genuinely longer counts. Restating the existing one is
  // not a repair, and treating it as one would relax the time pressure on every
  // step the timer covers while the clock the student sees is unchanged.
  const currentLimits = new Map(
    source.timeConstraints.map((constraint) => [constraint.id, constraint.limitMinutes])
  );
  const replacementLimits = new Map(
    changes.flatMap((change) =>
      change.action === "set_limit" &&
      change.limitMinutes !== null &&
      change.limitMinutes > (currentLimits.get(change.constraintId) ?? 0)
        ? [[change.constraintId, change.limitMinutes] as const]
        : []
    )
  );
  const timeConstraints = source.timeConstraints.flatMap((constraint) => {
    if (removedConstraintIds.has(constraint.id)) return [];
    const limitMinutes = replacementLimits.get(constraint.id);
    return [{ ...constraint, limitMinutes: limitMinutes ?? constraint.limitMinutes }];
  });

  // A step whose covering timers changed is relaxed only when the clock no
  // longer presses on it by the shared rule: no timer left covers it (0), or
  // every remaining covering timer is comfortable at the conservative rate (1).
  // A timer no repair touched keeps its steps as they were.
  const changedConstraintIds = new Set([...removedConstraintIds, ...replacementLimits.keys()]);
  const touchedStepIds = new Set(
    source.timeConstraints
      .filter((constraint) => changedConstraintIds.has(constraint.id))
      .flatMap((constraint) => constraint.stepIds)
  );
  const newTiming = analyzeTiming({ ...source, steps, timeConstraints });
  steps = steps.map((step, index) => {
    let timePressure = step.demands.timePressure;
    if (touchedStepIds.has(step.id)) {
      const covering = newTiming.constraints.filter((constraint) => constraint.stepIds.includes(step.id));
      if (covering.length === 0) timePressure = 0;
      else if (covering.every((constraint) => constraint.verdictConservative === "comfortable")) {
        timePressure = Math.min(timePressure, 1);
      }
    }
    return {
      ...step,
      demands: {
        ...step.demands,
        timePressure,
        contextSwitch:
          index > 0 && step.environment.trim() !== steps[index - 1].environment.trim(),
      },
    };
  });

  const analysis: Analysis = { ...source, steps, timeConstraints };
  const frictionResolutions = source.frictionMoments.map((moment) =>
    resolutionFor(source, analysis, moment, effectsByStep)
  );

  return { analysis, frictionResolutions, appliedRepairIds };
}

/** Steps that carry a repair the educator has not yet decided on. */
export function outstandingRepairs(analysis: Analysis, appliedStepIds: readonly string[]): number {
  const applied = new Set(appliedStepIds);
  return analysis.steps.filter((step) => step.repair !== null && !applied.has(step.id)).length;
}

/**
 * Whether this step's proposed repair acts on the barrier a finding names.
 * Used to pick which repair to show beside a finding: a response-alternative
 * repair must not be offered as the fix for a context-switching finding just
 * because both name the same step.
 */
export function repairTargetsFinding(source: Analysis, moment: FrictionMoment, step: Step): boolean {
  if (step.repair === null) return false;
  const effects = step.repair.effects;
  switch (moment.barrierType) {
    case "working_memory":
      return (effects.keepsInfoVisible && keepVisibleTarget(step) !== "none") || effects.reducesWorkingMemory;
    case "context_switching":
      return effects.replacementEnvironment !== null;
    case "fine_motor":
      return effects.reducesFineMotor;
    case "reading_load":
      return effects.reducesReadingLoad;
    case "single_modality_communication":
      return effects.addsResponseAlternative;
    case "sensory_color_only":
      return effects.addsNonColorCue;
    case "sensory_audio_only":
      return effects.addsCaptionOrTranscript;
    case "navigation_ambiguity":
      return true;
    case "time_pressure": {
      const ids = new Set(moment.stepIds);
      const covering = new Set(
        source.timeConstraints
          .filter((constraint) => constraint.stepIds.some((stepId) => ids.has(stepId)))
          .map((constraint) => constraint.id)
      );
      return timeConstraintChangesOf(effects).some((change) => covering.has(change.constraintId));
    }
  }
}
