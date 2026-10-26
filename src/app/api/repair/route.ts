import { NextResponse } from "next/server";
import { z } from "zod";

import { MODEL, SYSTEM_PROMPT, ThinkingLevel, describeModelFailure, getClient, parseStructured } from "@/lib/gemini";
import { normalizeAnalysisGraph } from "@/lib/graphNormalizer";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import {
  repairClassificationRequestSchema,
  repairSchema,
  timeConstraintChangesOf,
} from "@/lib/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = repairClassificationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "완전한 개선안과 유효한 작업 단계를 함께 제공해주세요." },
      { status: 400 }
    );
  }

  const normalized = normalizeAnalysisGraph(parsed.data.analysis).analysis;
  const step = normalized.steps.find((candidate) => candidate.id === parsed.data.stepId);
  if (!step) {
    return NextResponse.json({ error: "해당 작업 단계가 더 이상 존재하지 않습니다." }, { status: 400 });
  }

  const rate = checkRateLimit(request, "repair", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: `Classify the educator-authored repair below. Return the suggestion exactly as written, then recalculate its measured effects, barrier label, and whether it preserves the locked learning objective. Do not inherit any field from the previous repair unless the new wording independently supports it. Timer effects may reference only the supplied timer ids.

<learning_objective>
${parsed.data.lockedObjective}
</learning_objective>

<step>
${JSON.stringify(step)}
</step>

<time_constraints>
${JSON.stringify(normalized.timeConstraints)}
</time_constraints>

<educator_suggestion>
${parsed.data.suggestion}
</educator_suggestion>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 2500,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(repairSchema),
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const repair = parseStructured(repairSchema, response.text);
    if (!repair) {
      return NextResponse.json(
        { error: "개선안 분류 결과가 비어 있습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }

    const validConstraintIds = new Set(normalized.timeConstraints.map((item) => item.id));
    if (
      timeConstraintChangesOf(repair.effects).some(
        (change) => !validConstraintIds.has(change.constraintId)
      )
    ) {
      return NextResponse.json(
        { error: "개선안이 이 과제에 없는 타이머를 참조했습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ...repair,
      suggestion: parsed.data.suggestion,
    });
  } catch (error) {
    console.error("repair classification failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
