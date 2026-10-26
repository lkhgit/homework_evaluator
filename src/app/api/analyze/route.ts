import { NextResponse } from "next/server";
import { z } from "zod";

import { MODEL, SYSTEM_PROMPT, ThinkingLevel, describeModelFailure, getClient, parseStructured } from "@/lib/gemini";
import { clampAnalysis } from "@/lib/engine";
import { verifyEvidence } from "@/lib/evidenceGuard";
import { normalizeAnalysisGraph } from "@/lib/graphNormalizer";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import {
  analysisRequestSchema,
  repairProposalsSchema,
  taskGraphSchema,
  type Analysis,
  type TaskGraph,
} from "@/lib/schema";

// Two sequential model calls. The default 60s ceiling is not enough for a long
// assignment, and a timeout here surfaces to the educator as "could not be
// reached", which is the least useful thing the app can say.
export const maxDuration = 300;

const TASK_GRAPH_JSON_SCHEMA = z.toJSONSchema(taskGraphSchema);
const REPAIR_PROPOSALS_JSON_SCHEMA = z.toJSONSchema(repairProposalsSchema);

/** A compact view of the graph, so the repair pass sees the steps it must key against. */
function describeSteps(graph: TaskGraph): string {
  return graph.steps
    .map((step) => {
      const d = step.demands;
      const flags = [
        d.workingMemory >= 2 && `working memory ${d.workingMemory}`,
        d.fineMotor >= 2 && `fine motor ${d.fineMotor}`,
        d.timePressure >= 2 && `time pressure ${d.timePressure}`,
        d.readingLoad >= 2 && `reading load ${d.readingLoad}`,
        d.contextSwitch && "context switch",
        d.sensory.colorOnly && "colour only",
        d.sensory.audioOnly && "audio only",
        d.communication !== "none" && `responds by ${d.communication}`,
        !step.producedInfoStaysVisible && step.produces.length > 0 && "produced info disappears",
      ].filter(Boolean);
      return `- ${step.id} [${step.goalRelevance}] in ${step.environment}: ${step.action}${
        flags.length ? `\n    demands: ${flags.join(", ")}` : ""
      }`;
    })
    .join("\n");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = analysisRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "과제 전체 내용을 붙여넣고 학습 목표를 확정한 뒤 분석해주세요." },
      { status: 400 }
    );
  }

  const rate = checkRateLimit(request, "analyze", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { assignmentText, lockedObjective } = parsed.data;

  try {
    const client = getClient();

    // Pass one: the task graph, without repairs. This is the pass whose
    // judgement calls matter most, so it keeps a low-but-nonzero thinking
    // level while everything else in this file runs at MINIMAL to save quota.
    const graphResponse = await client.models.generateContent({
      model: MODEL,
      contents: `The educator has locked this learning objective:

<learning_objective>
${lockedObjective}
</learning_objective>

Decompose the assignment below into the sequence of actions a student performs, and judge every demand against that objective.

Remember: evidence quotes must be copied character-for-character from the assignment; information dependencies drive the working-memory analysis; each independent timer belongs in timeConstraints with its exact step scope; and a duration attached to one step belongs in estimatedMinutes.

<assignment>
${assignmentText}
</assignment>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 16000,
        responseMimeType: "application/json",
        responseJsonSchema: TASK_GRAPH_JSON_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const graph = parseStructured(taskGraphSchema, graphResponse.text);
    if (!graph) {
      return NextResponse.json(
        { error: "분석 결과가 비어 있습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }

    // Pass two: repairs for the steps that need one, keyed to the graph above.
    const repairResponse = await client.models.generateContent({
      model: MODEL,
      contents: `This assignment has already been decomposed. Propose repairs for the steps that impose a demand the locked objective does not require.

<learning_objective>
${lockedObjective}
</learning_objective>

<steps>
${describeSteps(graph)}
</steps>

<timers>
${graph.timeConstraints.map((c) => `- ${c.id}: ${c.limitMinutes} minutes, covering ${c.stepIds.join(", ")}`).join("\n") || "none"}
</timers>

<findings>
${graph.frictionMoments.map((f) => `- ${f.id} (${f.severity}, ${f.barrierType}) at ${f.stepIds.join(", ")}: ${f.title}`).join("\n") || "none"}
</findings>

Work finding by finding. A finding is only fixed once its barrier is gone from EVERY step it names, so cover them all: two steps that both require dragging need two repairs, and repairing one leaves the finding open. Make each repair's effects address that finding's barrier. A repair whose effects do not move the measurement behind the finding is worse for the educator than proposing nothing.

What each barrier needs before it can be shown as fixed:
- working_memory: keepsInfoVisible on the step that produces the information, so it survives without being memorised.
- context_switching: replacementEnvironment on a step, naming an environment already used elsewhere in the task. Nothing else consolidates a journey.
- time_pressure: the timer removed, or set_limit with a limit genuinely LONGER than the current one. Restating the existing limit changes nothing.
- fine_motor, reading_load, sensory_color_only, sensory_audio_only, single_modality_communication: the matching effect flag.
- navigation_ambiguity: no measurable demand exists. Propose the repair anyway; it will be recorded as unverified.

Use only step ids from the list above, and only timer ids from the timers list. Beyond covering the findings, leave out any step that needs no change: a short list an educator will accept is worth more than one repair per step. Every repair must state only the effects its own suggestion genuinely delivers.

<assignment>
${assignmentText}
</assignment>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
        responseJsonSchema: REPAIR_PROPOSALS_JSON_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const repairProposals = parseStructured(repairProposalsSchema, repairResponse.text);

    // Steps the repair pass did not name simply keep no repair.
    const byStep = new Map(
      (repairProposals?.repairs ?? []).map((entry) => [entry.stepId, entry.repair])
    );
    const merged: Analysis = {
      timeConstraints: graph.timeConstraints,
      frictionMoments: graph.frictionMoments,
      steps: graph.steps.map((step) => ({ ...step, repair: byStep.get(step.id) ?? null })),
    };

    const normalized = normalizeAnalysisGraph(clampAnalysis(merged));
    const checked = verifyEvidence(normalized.analysis, assignmentText);
    if (checked.discarded > 0) {
      console.warn(
        `evidence guard discarded ${checked.discarded} unverifiable quote(s): ${checked.discardedStepIds.join(", ")}`
      );
    }

    const warnings = [...normalized.warnings];
    if (checked.discarded > 0) {
      warnings.push(
        `근거 인용문 ${checked.discarded}개가 과제 원문에서 확인되지 않아 제거되었습니다.`
      );
    }
    return NextResponse.json({ analysis: checked.analysis, warnings });
  } catch (error) {
    console.error("analysis failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
