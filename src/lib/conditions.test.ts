import assert from "node:assert/strict";
import { test } from "node:test";

import { CONDITIONS, type ConditionContext } from "@/components/WorkflowScreens";
import { runEngine } from "./engine";
import { applyRepairs, timingPresent } from "./repairs";
import { BIOLOGY_SAMPLE } from "@/samples/biology";
import type { Analysis, RepairEffects, Step } from "./schema";

const analysis = BIOLOGY_SAMPLE.analysis;
const contextFor = (a: typeof analysis): ConditionContext => {
  const report = runEngine(a);
  return { memory: report.memory, timing: report.timing };
};

const condition = (id: string) => CONDITIONS.find((item) => item.id === id)!;

test("a step that holds nothing does not fail the working-memory condition", () => {
  const context = contextFor(analysis);
  const fails = condition("working_memory").fails;

  // s1 reads the instructions in Canvas. It carries nothing forward and
  // produces nothing that disappears, so failing it would tell an educator
  // that reading is a working-memory barrier.
  const reading = analysis.steps.find((step) => step.id === "s1")!;
  assert.equal(fails(reading, context), false);

  // s5 produces three values the simulation does not save. That is the barrier.
  const observing = analysis.steps.find((step) => step.id === "s5")!;
  assert.equal(fails(observing, context), true);
});

test("the working-memory condition does not fail every step at once", () => {
  const context = contextFor(analysis);
  const failing = analysis.steps.filter((step) =>
    condition("working_memory").fails(step, context)
  );
  assert.ok(
    failing.length < analysis.steps.length,
    `every one of ${analysis.steps.length} steps failed, which tells an educator nothing`
  );
});

test("keeping values visible flips the steps that depended on memory", () => {
  const before = contextFor(analysis);
  const repaired = applyRepairs(analysis, ["s5", "s8"]).analysis;
  const after = contextFor(repaired);
  const fails = condition("working_memory").fails;

  const failingBefore = analysis.steps.filter((step) => fails(step, before)).length;
  const failingAfter = repaired.steps.filter((step) => fails(step, after)).length;
  assert.ok(
    failingAfter < failingBefore,
    `repairs should reduce the failing steps: ${failingBefore} -> ${failingAfter}`
  );
});

test("a comfortable timer does not fail processing time, whatever the step's rating", () => {
  const context = contextFor(analysis);
  // The sample's 12-minute quiz fits even at the conservative reading rate.
  // The steps are rated time-pressured and the clock cannot be paused, but that
  // is a qualitative concern, not a measured processing-time barrier.
  for (const step of analysis.steps) {
    const covering = context.timing.constraints.filter((c) => c.stepIds.includes(step.id));
    const expected = covering.some((c) => c.verdictConservative !== "comfortable");
    assert.equal(condition("processing_time").fails(step, context), expected, step.id);
  }
  assert.ok(analysis.steps.every((step) => !condition("processing_time").fails(step, context)));
  const timerFinding = analysis.frictionMoments.find((item) => item.barrierType === "time_pressure")!;
  assert.equal(timingPresent(analysis, timerFinding), false);
});

function timed(limitMinutes: number, extra: Analysis["timeConstraints"] = []): Analysis {
  return {
    frictionMoments: [],
    timeConstraints: [{ id: "clock", limitMinutes, stepIds: ["a"], evidence: "" }, ...extra],
    steps: [
      {
        ...analysis.steps[0],
        id: "a",
        estimatedMinutes: 10,
        repair: {
          suggestion: "Allow an hour.",
          barrierReduced: "time",
          rigorPreserved: true,
          rigorNote: "",
          effects: {
            keepsInfoVisible: false,
            reducesWorkingMemory: false,
            reducesFineMotor: false,
            timeConstraintId: "clock",
            timeConstraintAction: "set_limit",
            timeConstraintLimitMinutes: 600,
            reducesReadingLoad: false,
            addsNonColorCue: false,
            addsCaptionOrTranscript: false,
            addsResponseAlternative: false,
            replacementEnvironment: null,
          },
        },
      },
    ],
  };
}

test("a tight timer fails processing time and an accepted extension clears it", () => {
  const source = timed(10);
  const fails = condition("processing_time").fails;
  assert.equal(fails(source.steps[0], contextFor(source)), true);
  const repaired = applyRepairs(source, ["a"]).analysis;
  assert.equal(fails(repaired.steps[0], contextFor(repaired)), false);
});

test("with overlapping timers, any timer that is not comfortable still fails the step", () => {
  const overlapping = timed(10, [{ id: "outer", limitMinutes: 600, stepIds: ["a"], evidence: "" }]);
  const fails = condition("processing_time").fails;
  assert.equal(fails(overlapping.steps[0], contextFor(overlapping)), true);

  // Extending only the outer, already comfortable timer leaves the tight one.
  const outerOnly = timed(10, [{ id: "outer", limitMinutes: 60, stepIds: ["a"], evidence: "" }]);
  outerOnly.steps[0].repair!.effects.timeConstraintId = "outer";
  const repaired = applyRepairs(outerOnly, ["a"]).analysis;
  assert.equal(fails(repaired.steps[0], contextFor(repaired)), true);
});

// Reviewer fixture D6: typed steps, T1 = 30 min over all three, T2 = 2 min over s2.
function d6(options: { t1?: number; t2?: number | null; change?: Partial<RepairEffects> } = {}): Analysis {
  const base = analysis.steps[0];
  const make = (id: string, timePressure: number, wordCount: number): Step => ({
    ...base,
    id,
    environment: "Canvas",
    produces: [],
    consumes: [],
    estimatedMinutes: null,
    demands: { ...base.demands, timePressure, wordCount, communication: "typed" as const, readingLoad: 0, workingMemory: 0, contextSwitch: false },
    repair: null,
  });
  const steps = [make("s1", 2, 0), make("s2", 3, 600), make("s3", 2, 0)];
  if (options.change) {
    steps[1].repair = {
      suggestion: "Change the timer.",
      barrierReduced: "time",
      rigorPreserved: true,
      rigorNote: "",
      effects: { ...noEffect(), ...options.change },
    };
  }
  const timeConstraints: Analysis["timeConstraints"] = [
    { id: "T1", limitMinutes: options.t1 ?? 30, stepIds: ["s1", "s2", "s3"], evidence: "" },
  ];
  if (options.t2 !== null) timeConstraints.push({ id: "T2", limitMinutes: options.t2 ?? 2, stepIds: ["s2"], evidence: "" });
  return {
    steps,
    timeConstraints,
    frictionMoments: [{ id: "f1", title: "t", stepIds: ["s2"], severity: "high", barrierType: "time_pressure", explanation: "" }],
  };
}

function noEffect(): RepairEffects {
  return {
    keepsInfoVisible: false, reducesWorkingMemory: false, reducesFineMotor: false,
    timeConstraintId: null, timeConstraintAction: null, timeConstraintLimitMinutes: null,
    reducesReadingLoad: false, addsNonColorCue: false, addsCaptionOrTranscript: false,
    addsResponseAlternative: false, replacementEnvironment: null,
  };
}

const extendT2 = { timeConstraintId: "T2", timeConstraintAction: "set_limit" as const, timeConstraintLimitMinutes: 10 };
const removeT2 = { timeConstraintId: "T2", timeConstraintAction: "remove" as const };

function outcome(source: Analysis) {
  const application = applyRepairs(source, ["s2"]);
  const s2 = application.analysis.steps.find((step) => step.id === "s2")!;
  return {
    status: application.frictionResolutions[0].status,
    timePressure: s2.demands.timePressure,
    conditionFails: condition("processing_time").fails(s2, contextFor(application.analysis)),
    repaired: application.analysis,
  };
}

test("D6a: extending a nested timer under a comfortable outer timer resolves", () => {
  const result = outcome(d6({ change: extendT2 }));
  assert.equal(result.status, "resolved");
  assert.equal(result.timePressure, 1);
  assert.equal(result.conditionFails, false);
});

test("D6b: removing a nested timer under a comfortable outer timer resolves", () => {
  const result = outcome(d6({ change: removeT2 }));
  assert.equal(result.status, "resolved");
  assert.equal(result.timePressure, 1);
  assert.equal(result.conditionFails, false);
});

test("D6c: an infeasible outer timer keeps the finding open", () => {
  const result = outcome(d6({ t1: 6, change: extendT2 }));
  assert.equal(result.status, "unresolved");
  assert.equal(result.conditionFails, true);
});

test("D6d: presence uses the conservative verdict", () => {
  const source = d6({ t1: 3, t2: null, change: { timeConstraintId: "T1", timeConstraintAction: "set_limit", timeConstraintLimitMinutes: 8 } });
  source.steps[1].demands.wordCount = 900;
  const result = outcome(source);
  assert.equal(result.status, "unresolved");
  assert.equal(result.conditionFails, true);
});

test("the processing-time condition and finding resolution agree on every step", () => {
  const fixtures = [
    d6(), d6({ change: extendT2 }), d6({ change: removeT2 }), d6({ t1: 6, change: extendT2 }),
    analysis,
  ];
  for (const fixture of fixtures) {
    for (const source of [fixture, applyRepairs(fixture, fixture.steps.map((step) => step.id)).analysis]) {
      const context = contextFor(source);
      for (const step of source.steps) {
        const finding = { id: "x", title: "", stepIds: [step.id], severity: "low" as const, barrierType: "time_pressure" as const, explanation: "" };
        assert.equal(condition("processing_time").fails(step, context), timingPresent(source, finding), step.id);
      }
    }
  }
});
