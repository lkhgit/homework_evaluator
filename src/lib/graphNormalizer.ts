import type { Analysis, Step, TimeConstraint } from "./schema";

export interface NormalizedAnalysis {
  analysis: Analysis;
  warnings: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function counts(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function renamedId(base: string, occurrence: number, reserved: Set<string>): string {
  let candidate = `${base || "step"}__${occurrence}`;
  let suffix = occurrence;
  while (reserved.has(candidate)) candidate = `${base || "step"}__${++suffix}`;
  reserved.add(candidate);
  return candidate;
}

/**
 * Repairs relationships the JSON schema cannot express. The model result stays
 * usable, but every discarded or rewritten relationship is reported so the UI
 * never silently attributes a finding to the wrong step.
 */
export function normalizeAnalysisGraph(source: Analysis): NormalizedAnalysis {
  const warnings: string[] = [];
  const originalStepIds = source.steps.map((step) => step.id.trim());
  const stepCounts = counts(originalStepIds);
  const reservedStepIds = new Set(
    originalStepIds.filter((id) => id && stepCounts.get(id) === 1)
  );
  const occurrences = new Map<string, number>();

  let steps: Step[] = source.steps.map((step) => {
    const originalId = step.id.trim();
    if (originalId && stepCounts.get(originalId) === 1) return { ...step, id: originalId };

    const occurrence = (occurrences.get(originalId) ?? 0) + 1;
    occurrences.set(originalId, occurrence);
    const id = renamedId(originalId, occurrence, reservedStepIds);
    warnings.push(
      `단계 id "${originalId || "(비어 있음)"}"가 중복되어 "${id}"로 변경되었습니다. 이 중복 id를 참조하던 항목은 제거되었습니다.`
    );
    return { ...step, id };
  });

  const validReferenceIds = new Set(
    originalStepIds.filter((id) => id && stepCounts.get(id) === 1)
  );
  const producedEarlier = new Set<string>();
  steps = steps.map((step, index) => {
    const produces = unique(step.produces);
    const requestedConsumes = unique(step.consumes);
    const consumes = requestedConsumes.filter((item) => producedEarlier.has(item));
    if (produces.length !== step.produces.length) {
      warnings.push(`단계 "${step.id}"에서 중복되거나 비어 있는 생성 값이 제거되었습니다.`);
    }
    if (consumes.length !== step.consumes.length) {
      warnings.push(
        `단계 "${step.id}"에서 이전에 생성된 적 없는 의존 항목이 제거되었습니다.`
      );
    }
    for (const item of produces) producedEarlier.add(item);
    const contextSwitch =
      index > 0 && step.environment.trim() !== steps[index - 1].environment.trim();
    if (contextSwitch !== step.demands.contextSwitch) {
      warnings.push(`단계 "${step.id}"의 환경 전환 여부가 다시 계산되었습니다.`);
    }
    return {
      ...step,
      produces,
      consumes,
      demands: { ...step.demands, contextSwitch },
    };
  });

  const constraintCounts = counts(source.timeConstraints.map((constraint) => constraint.id.trim()));
  const reservedConstraintIds = new Set(
    source.timeConstraints
      .map((constraint) => constraint.id.trim())
      .filter((id) => id && constraintCounts.get(id) === 1)
  );
  const constraintOccurrences = new Map<string, number>();
  const timeConstraints: TimeConstraint[] = [];

  for (const constraint of source.timeConstraints) {
    const originalId = constraint.id.trim();
    let id = originalId;
    if (!originalId || constraintCounts.get(originalId) !== 1) {
      const occurrence = (constraintOccurrences.get(originalId) ?? 0) + 1;
      constraintOccurrences.set(originalId, occurrence);
      id = renamedId(originalId || "timer", occurrence, reservedConstraintIds);
      warnings.push(
        `타이머 id "${originalId || "(비어 있음)"}"가 중복되어 "${id}"로 변경되었습니다. 이 중복 id를 참조하던 개선안은 제거되었습니다.`
      );
    }

    const stepIds = unique(constraint.stepIds).filter((stepId) =>
      validReferenceIds.has(stepId)
    );
    if (stepIds.length !== constraint.stepIds.length) {
      warnings.push(`타이머 "${id}"에서 유효하지 않거나 중복된 단계 참조가 제거되었습니다.`);
    }
    if (stepIds.length === 0) {
      warnings.push(`타이머 "${id}"는 유효한 단계가 없어 제거되었습니다.`);
      continue;
    }
    timeConstraints.push({ ...constraint, id, stepIds });
  }

  const validConstraintIds = new Set(
    timeConstraints
      .map((constraint) => constraint.id)
      .filter((id) => constraintCounts.get(id) === 1)
  );
  steps = steps.map((step) => {
    if (step.repair === null) return step;
    const { timeConstraintId: named, timeConstraintAction, timeConstraintLimitMinutes } =
      step.repair.effects;
    if (named === null) return step;

    // A new limit that is missing, or no longer than the one already imposed,
    // is not a change anything can measure. Left in place it reads as a timer
    // repair, counts as one, and then moves nothing, so the finding it belongs
    // to reports that the repair failed rather than that none addressed it.
    // The model has proposed replacing a twelve-minute limit with twelve
    // minutes, so this is not hypothetical.
    const current = timeConstraints.find((constraint) => constraint.id === named);
    const uselessLimit =
      timeConstraintAction === "set_limit" &&
      (timeConstraintLimitMinutes === null ||
        timeConstraintLimitMinutes <= 0 ||
        (current !== undefined && timeConstraintLimitMinutes <= current.limitMinutes));

    if (validConstraintIds.has(named) && !uselessLimit) return step;

    warnings.push(
      uselessLimit
        ? `단계 "${step.id}"의 개선안이 기존보다 길지 않은 제한 시간을 제안하여, 시간 개선으로 반영되지 않았습니다.`
        : `단계 "${step.id}"의 개선안에서 유효하지 않은 타이머 변경이 제거되었습니다.`
    );
    return {
      ...step,
      repair: {
        ...step.repair,
        effects: {
          ...step.repair.effects,
          timeConstraintId: null,
          timeConstraintAction: null,
          timeConstraintLimitMinutes: null,
        },
      },
    };
  });

  const frictionIdCounts = counts(source.frictionMoments.map((moment) => moment.id.trim()));
  const frictionOccurrences = new Map<string, number>();
  const reservedFrictionIds = new Set(
    source.frictionMoments
      .map((moment) => moment.id.trim())
      .filter((id) => id && frictionIdCounts.get(id) === 1)
  );
  const frictionMoments = source.frictionMoments.flatMap((moment) => {
    const originalId = moment.id.trim();
    let id = originalId;
    if (!originalId || frictionIdCounts.get(originalId) !== 1) {
      const occurrence = (frictionOccurrences.get(originalId) ?? 0) + 1;
      frictionOccurrences.set(originalId, occurrence);
      id = renamedId(originalId || "friction", occurrence, reservedFrictionIds);
      warnings.push(`마찰 지점 id "${originalId || "(비어 있음)"}"가 "${id}"로 변경되었습니다.`);
    }
    const stepIds = unique(moment.stepIds).filter((stepId) => validReferenceIds.has(stepId));
    if (stepIds.length !== moment.stepIds.length) {
      warnings.push(`마찰 지점 "${id}"에서 유효하지 않거나 중복된 단계 참조가 제거되었습니다.`);
    }
    if (stepIds.length === 0) {
      warnings.push(`마찰 지점 "${id}"는 유효한 단계가 없어 제거되었습니다.`);
      return [];
    }
    return [{ ...moment, id, stepIds }];
  });

  return {
    analysis: { ...source, steps, timeConstraints, frictionMoments },
    warnings,
  };
}
