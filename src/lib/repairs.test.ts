import assert from "node:assert/strict";
import { test } from "node:test";

import { runEngine, scoreAccessibility } from "./engine";
import { applyRepairs } from "./repairs";
import type { Analysis, FrictionMoment, RepairEffects, Step } from "./schema";
import { BIOLOGY_SAMPLE } from "@/samples/biology";

function effects(partial: Partial<RepairEffects> = {}): RepairEffects {
  return {
    keepsInfoVisible: false,
    reducesWorkingMemory: false,
    reducesFineMotor: false,
    timeConstraintId: null,
    timeConstraintAction: null,
    timeConstraintLimitMinutes: null,
    reducesReadingLoad: false,
    addsNonColorCue: false,
    addsCaptionOrTranscript: false,
    addsResponseAlternative: false,
    replacementEnvironment: null,
    ...partial,
  };
}

function step(
  id: string,
  overrides: Partial<Step> & { repairEffects?: RepairEffects | null } = {}
): Step {
  const { repairEffects = null, demands, ...rest } = overrides;
  return {
    id,
    action: `Completes ${id}`,
    environment: "Canvas",
    produces: [],
    consumes: [],
    producedInfoStaysVisible: true,
    requires: [],
    estimatedMinutes: null,
    evidence: "",
    goalRelevance: "incidental",
    relevanceReason: "",
    ...rest,
    demands: {
      workingMemory: 0,
      fineMotor: 0,
      timePressure: 0,
      readingLoad: 0,
      contextSwitch: false,
      sensory: { colorOnly: false, audioOnly: false },
      communication: "none",
      wordCount: 0,
      ...demands,
    },
    repair:
      repairEffects === null
        ? null
        : {
            suggestion: `Repair ${id}`,
            effects: repairEffects,
            barrierReduced: "barrier",
            rigorPreserved: true,
            rigorNote: "The same evidence is assessed.",
          },
  };
}

function moment(overrides: Partial<FrictionMoment> = {}): FrictionMoment {
  return {
    id: "f1",
    title: "Finding",
    stepIds: ["a"],
    severity: "high",
    barrierType: "fine_motor",
    explanation: "",
    ...overrides,
  };
}

function analysis(
  steps: Step[],
  frictionMoments: FrictionMoment[] = [],
  timeConstraints: Analysis["timeConstraints"] = []
): Analysis {
  return { steps, frictionMoments, timeConstraints };
}

test("no accepted repair preserves the graph and leaves findings unresolved", () => {
  const source = analysis(
    [step("a", { demands: { fineMotor: 3 } as Step["demands"] })],
    [moment()]
  );
  const result = applyRepairs(source, []);
  assert.deepEqual(result.analysis, source);
  assert.equal(result.frictionResolutions[0].status, "unresolved");
});

test("a repair changes only its explicit effects", () => {
  const source = analysis([
    step("a", {
      repairEffects: effects({ reducesFineMotor: true }),
      demands: {
        workingMemory: 3,
        fineMotor: 3,
        timePressure: 3,
        readingLoad: 3,
        contextSwitch: false,
        sensory: { colorOnly: true, audioOnly: true },
        communication: "spoken",
        wordCount: 0,
      },
    }),
  ]);
  const repaired = applyRepairs(source, ["a"]).analysis.steps[0];
  assert.equal(repaired.demands.fineMotor, 1);
  assert.equal(repaired.demands.workingMemory, 3);
  assert.equal(repaired.demands.timePressure, 3);
  assert.equal(repaired.demands.readingLoad, 3);
  assert.deepEqual(repaired.demands.sensory, { colorOnly: true, audioOnly: true });
  assert.equal(repaired.demands.communication, "spoken");
});

test("a response alternative becomes multiple, while typed remains a forced mode", () => {
  const source = analysis(
    [
      step("a", {
        repairEffects: effects({ addsResponseAlternative: true }),
        demands: { communication: "typed" } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "single_modality_communication" })]
  );
  const result = applyRepairs(source, ["a"]);
  assert.equal(result.analysis.steps[0].demands.communication, "multiple");
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("removing one timer clears its full scope without touching another timer", () => {
  const source = analysis(
    [
      // Two minutes of stated work under a one-minute clock: genuinely tight.
      step("quiz-a", { estimatedMinutes: 2, demands: { timePressure: 3 } as Step["demands"] }),
      step("quiz-b", {
        repairEffects: effects({
          timeConstraintId: "quiz",
          timeConstraintAction: "remove",
        }),
        demands: { timePressure: 3 } as Step["demands"],
      }),
      step("recording", {
        estimatedMinutes: 2,
        demands: { timePressure: 2, communication: "spoken" } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "time_pressure", stepIds: ["quiz-a", "quiz-b"] })],
    [
      { id: "quiz", limitMinutes: 1, stepIds: ["quiz-a", "quiz-b"], evidence: "" },
      { id: "recording-window", limitMinutes: 5, stepIds: ["recording"], evidence: "" },
    ]
  );
  const result = applyRepairs(source, ["quiz-b"]);
  assert.deepEqual(result.analysis.timeConstraints.map((item) => item.id), ["recording-window"]);
  assert.equal(result.analysis.steps[0].demands.timePressure, 0);
  assert.equal(result.analysis.steps[1].demands.timePressure, 0);
  assert.equal(result.analysis.steps[2].demands.timePressure, 2);
  assert.equal(result.analysis.steps[2].estimatedMinutes, 2);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("a timer can be extended without removing independent constraints", () => {
  const source = analysis(
    [step("a", {
      estimatedMinutes: 2,
      demands: { timePressure: 3 } as Step["demands"],
      repairEffects: effects({ timeConstraintId: "clock", timeConstraintAction: "set_limit", timeConstraintLimitMinutes: 20 }),
    })],
    [moment({ barrierType: "time_pressure" })],
    [{ id: "clock", limitMinutes: 1, stepIds: ["a"], evidence: "" }]
  );
  const result = applyRepairs(source, ["a"]);
  assert.equal(result.analysis.timeConstraints[0].limitMinutes, 20);
  assert.equal(result.analysis.steps[0].demands.timePressure, 1);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("an unrelated motor repair never resolves context switching", () => {
  const source = analysis(
    [
      step("a"),
      step("b", {
        environment: "PhET",
        demands: { contextSwitch: true } as Step["demands"],
      }),
      step("c", {
        environment: "PhET",
        repairEffects: effects({ reducesFineMotor: true }),
        demands: { fineMotor: 3 } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "context_switching", stepIds: ["b"] })]
  );
  const result = applyRepairs(source, ["c"]);
  assert.equal(result.analysis.steps[1].environment, "PhET");
  assert.equal(result.frictionResolutions[0].status, "unresolved");
});

test("an explicit environment consolidation can resolve a measured transition", () => {
  const source = analysis(
    [
      step("a"),
      step("b", {
        environment: "PhET",
        repairEffects: effects({ replacementEnvironment: "Canvas" }),
        demands: { contextSwitch: true } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "context_switching", stepIds: ["b"] })]
  );
  const result = applyRepairs(source, ["b"]);
  assert.equal(result.analysis.steps[1].demands.contextSwitch, false);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("navigation repairs are recorded but remain unverified", () => {
  const source = analysis(
    [step("a", { repairEffects: effects() })],
    [moment({ barrierType: "navigation_ambiguity" })]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "unverified");
});

test("a repair cannot resolve a condition absent from the original graph", () => {
  const source = analysis(
    [step("a", { repairEffects: effects({ reducesFineMotor: true }) })],
    [moment()]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "unverified");
});

test("making carried values visible resolves measured memory friction", () => {
  const source = analysis(
    [
      step("a", {
        produces: ["value"],
        producedInfoStaysVisible: false,
        repairEffects: effects({ keepsInfoVisible: true }),
      }),
      step("b", { consumes: ["value"] }),
    ],
    [moment({ barrierType: "working_memory", stepIds: ["a", "b"] })]
  );
  assert.equal(applyRepairs(source, ["a"]).frictionResolutions[0].status, "resolved");
});

test("the after-score stops charging only verified resolved findings", () => {
  const source = analysis(
    [
      step("a", {
        repairEffects: effects({ reducesFineMotor: true }),
        demands: { fineMotor: 3 } as Step["demands"],
      }),
    ],
    [moment()]
  );
  const application = applyRepairs(source, ["a"]);
  const before = scoreAccessibility(runEngine(source), source).score;
  const resolved = new Set(
    application.frictionResolutions
      .filter((item) => item.status === "resolved")
      .map((item) => item.frictionId)
  );
  const after = scoreAccessibility(
    runEngine(application.analysis),
    application.analysis,
    resolved
  ).score;
  assert.ok(after > before);
});

test("an unrelated carried value does not keep a fixed memory finding open", () => {
  // The finding is about values produced in one tool and needed in another.
  // A separate value passing through the same step, without crossing an
  // environment change, is not what the finding is about and must not outvote
  // the measurement showing the barrier is gone.
  const source = analysis(
    [
      step("setup", { environment: "PhET", produces: ["chamber"] }),
      step("observe", {
        environment: "PhET",
        consumes: ["chamber"],
        produces: ["v1", "v2", "v3"],
        producedInfoStaysVisible: false,
        repairEffects: effects({ keepsInfoVisible: true, reducesWorkingMemory: true }),
      }),
      step("quiz", {
        environment: "Canvas",
        consumes: ["v1", "v2", "v3"],
        demands: { contextSwitch: true } as Step["demands"],
      }),
    ],
    [moment({ barrierType: "working_memory", stepIds: ["observe", "quiz"] })]
  );

  const result = applyRepairs(source, ["observe"]);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("restating a time limit is not a timing repair", () => {
  const source = analysis(
    [
      step("quiz", {
        demands: { timePressure: 3 } as Step["demands"],
        repairEffects: effects({
          timeConstraintId: "clock",
          timeConstraintAction: "set_limit",
          timeConstraintLimitMinutes: 12,
        }),
      }),
    ],
    [moment({ barrierType: "time_pressure", stepIds: ["quiz"] })],
    [{ id: "clock", limitMinutes: 12, stepIds: ["quiz"], evidence: "" }]
  );

  const result = applyRepairs(source, ["quiz"]);
  assert.equal(result.analysis.timeConstraints[0].limitMinutes, 12, "the clock is unchanged");
  assert.notEqual(result.frictionResolutions[0].status, "resolved");
});

test("a step rated time-pressured with no stated timer cannot block resolution", () => {
  // The timer covers the quiz only, but the finding also names a step the model
  // rated pressured with no clock on it. Removing the timer must still resolve
  // the finding, because no repair can ever move an unbacked rating.
  const source = analysis(
    [
      step("quiz", {
        estimatedMinutes: 10,
        demands: { timePressure: 3 } as Step["demands"],
        repairEffects: effects({
          timeConstraintId: "clock",
          timeConstraintAction: "remove",
        }),
      }),
      step("recording", { demands: { timePressure: 3 } as Step["demands"] }),
    ],
    [moment({ barrierType: "time_pressure", stepIds: ["quiz", "recording"] })],
    [{ id: "clock", limitMinutes: 5, stepIds: ["quiz"], evidence: "" }]
  );

  const result = applyRepairs(source, ["quiz"]);
  assert.deepEqual(result.analysis.timeConstraints, []);
  assert.equal(result.frictionResolutions[0].status, "resolved");
});

test("removing a comfortable timer is unverified, not a measured fix", () => {
  // A timer with ample room is not a measured processing-time barrier, even if
  // it cannot be paused. Removing it may still be right, but the app cannot
  // claim it resolved a condition it never measured.
  const source = analysis(
    [
      step("quiz", {
        demands: { timePressure: 3 } as Step["demands"],
        repairEffects: effects({ timeConstraintId: "clock", timeConstraintAction: "remove" }),
      }),
    ],
    [moment({ barrierType: "time_pressure", stepIds: ["quiz"] })],
    [{ id: "clock", limitMinutes: 30, stepIds: ["quiz"], evidence: "" }]
  );
  assert.equal(applyRepairs(source, ["quiz"]).frictionResolutions[0].status, "unverified");
});

test("accepting a repair that changes no measurement does not raise the score", () => {
  // Reproduction from review: an incidental step's proposal with every effect
  // off. Accepting it clears the proposal but moves nothing, so the score and
  // every finding must stay exactly where they were.
  const source = structuredClone(BIOLOGY_SAMPLE.analysis);
  const s4 = source.steps.find((item) => item.id === "s4")!;
  s4.repair = { ...s4.repair!, effects: effects() };
  const resolvedIds = (application: ReturnType<typeof applyRepairs>) =>
    new Set(
      application.frictionResolutions
        .filter((item) => item.status === "resolved")
        .map((item) => item.frictionId)
    );

  const before = scoreAccessibility(runEngine(source), source).score;
  const application = applyRepairs(source, ["s4"]);
  assert.equal(resolvedIds(application).size, 0);
  const after = scoreAccessibility(
    runEngine(application.analysis),
    application.analysis,
    resolvedIds(application)
  ).score;
  assert.equal(after, before);
});

test("an incidental step is charged for its burden, not for carrying a proposal", () => {
  const withProposal = analysis([
    step("a", { repairEffects: effects(), demands: { fineMotor: 3 } as Step["demands"] }),
  ]);
  const withoutProposal = analysis([
    step("a", { demands: { fineMotor: 3 } as Step["demands"] }),
  ]);
  const score = (source: Analysis) => scoreAccessibility(runEngine(source), source).score;
  assert.equal(score(withProposal), score(withoutProposal));
  assert.ok(score(withoutProposal) < 100);

  const noBurden = analysis([step("a", { repairEffects: effects({ reducesFineMotor: true }) })]);
  assert.equal(score(noBurden), 100);
});

test("the sample's effective incidental repair still lowers the incidental charge", () => {
  const source = BIOLOGY_SAMPLE.analysis;
  const label = (source: Analysis) =>
    scoreAccessibility(runEngine(source), source).breakdown.find((item) =>
      item.label.startsWith("목표와 무관한")
    )?.points ?? 0;
  const repaired = applyRepairs(source, ["s4"]).analysis;
  assert.ok(label(repaired) > label(source));
});

// Reviewer repro: a value produced at s1 is used at s3 and again at s5.
function carriedTwice(repairAt: Record<string, RepairEffects> = {}): Analysis["steps"] {
  const at = (id: string) => (repairAt[id] ? { repairEffects: repairAt[id] } : {});
  return [
    step("s1", { produces: ["value"], producedInfoStaysVisible: false, ...at("s1") }),
    step("s2", at("s2")),
    step("s3", { consumes: ["value"], ...at("s3") }),
    step("s4", at("s4")),
    step("s5", { consumes: ["value"], ...at("s5") }),
  ];
}

test("every consumer of a carried value is recorded, not only the last", () => {
  const memory = runEngine(analysis(carriedTwice())).memory;
  assert.deepEqual(memory.carried[0].consumedAtStepIds, ["s3", "s5"]);
  assert.equal(memory.carried[0].consumedAtStepId, "s5");
});

test("a finding about the producer and an earlier consumer is measured even when a later consumer exists", () => {
  const source = analysis(
    carriedTwice({ s1: effects({ keepsInfoVisible: true }) }),
    [moment({ barrierType: "working_memory", stepIds: ["s1", "s3"] })]
  );
  const resolution = applyRepairs(source, ["s1"]).frictionResolutions[0];
  assert.equal(resolution.status, "resolved", resolution.reason);
});

test("a keep-visible repair on the consuming step shows the value there, and only there", () => {
  const steps = carriedTwice({ s3: effects({ keepsInfoVisible: true }) });
  const narrow = analysis(steps, [
    moment({ id: "narrow", barrierType: "working_memory", stepIds: ["s1", "s3"] }),
    moment({ id: "wide", barrierType: "working_memory", stepIds: ["s1", "s3", "s5"] }),
  ]);
  const application = applyRepairs(narrow, ["s3"]);
  const repaired = application.analysis;

  // Not silently turned into producer persistence.
  assert.equal(repaired.steps.find((item) => item.id === "s1")!.producedInfoStaysVisible, false);
  assert.deepEqual(repaired.steps.find((item) => item.id === "s3")!.referencedItems, ["value"]);

  // s5 still needs the value from memory.
  const memory = runEngine(repaired).memory;
  assert.deepEqual(memory.carried[0].consumedAtStepIds, ["s5"]);

  const status = Object.fromEntries(
    application.frictionResolutions.map((item) => [item.frictionId, item.status])
  );
  assert.equal(status.narrow, "resolved");
  assert.equal(status.wide, "unresolved");
});

test("a keep-visible repair on a step that neither produces nor uses values changes nothing", () => {
  const source = analysis(
    carriedTwice({ s2: effects({ keepsInfoVisible: true }) }),
    [moment({ barrierType: "working_memory", stepIds: ["s1", "s2", "s3"] })]
  );
  const application = applyRepairs(source, ["s2"]);
  assert.equal(application.frictionResolutions[0].status, "unresolved");
  assert.deepEqual(runEngine(application.analysis).memory, runEngine(source).memory);
});

test("memory: a value produced again and kept visible is not carried (R1)", () => {
  const source = analysis([
    step("s1", { produces: ["v"], producedInfoStaysVisible: false }),
    step("s2", { environment: "B", demands: { contextSwitch: true } as Step["demands"] }),
    step("s3", { produces: ["v"], producedInfoStaysVisible: true }),
    step("s4", { consumes: ["v"] }),
  ]);
  assert.deepEqual(runEngine(source).memory.perStep.map((entry) => entry.load), [0, 0, 0, 0]);
});

test("memory: a hidden value produced after a visible one is carried (R2)", () => {
  const source = analysis([
    step("s1", { produces: ["v"], producedInfoStaysVisible: true }),
    step("s2", { environment: "B", demands: { contextSwitch: true } as Step["demands"] }),
    step("s3", { environment: "B", produces: ["v"], producedInfoStaysVisible: false }),
    step("s4", { environment: "C", demands: { contextSwitch: true } as Step["demands"] }),
    step("s5", { environment: "C", consumes: ["v"] }),
  ]);
  const memory = runEngine(source).memory;
  assert.deepEqual(memory.perStep.map((entry) => entry.load), [0, 0, 1, 1, 1]);
  assert.equal(memory.carried[0].producedAtStepId, "s3");
  assert.equal(memory.carried[0].decayRisk, true);
});
