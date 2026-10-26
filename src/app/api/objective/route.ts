import { NextResponse } from "next/server";
import { z } from "zod";

import { MODEL, SYSTEM_PROMPT, ThinkingLevel, describeModelFailure, getClient, parseStructured } from "@/lib/gemini";
import { LIGHT_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { objectiveExtractionSchema, objectiveRequestSchema } from "@/lib/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = objectiveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "과제 전체 내용을 붙여넣어야 분석할 것이 있습니다." },
      { status: 400 }
    );
  }

  const rate = checkRateLimit(request, "objective", LIGHT_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { assignmentText } = parsed.data;

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: `Identify what this assignment is actually trying to teach. Give at most three candidate learning objectives, most likely first, each phrased as what the student should be able to do.

If the assignment states an objective explicitly, quote it as the source. Otherwise infer it from the content and set source to "inferred".

<assignment>
${assignmentText}
</assignment>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(objectiveExtractionSchema),
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const objective = parseStructured(objectiveExtractionSchema, response.text);
    if (!objective) {
      return NextResponse.json(
        { error: "이 과제에서 학습 목표를 읽어내지 못했습니다." },
        { status: 502 }
      );
    }

    return NextResponse.json(objective);
  } catch (error) {
    console.error("objective extraction failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
