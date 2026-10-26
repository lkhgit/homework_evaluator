import { NextResponse } from "next/server";
import { z } from "zod";

import { MODEL, SYSTEM_PROMPT, ThinkingLevel, describeModelFailure, getClient, parseStructured } from "@/lib/gemini";
import { ANALYSIS_LIMIT, checkRateLimit } from "@/lib/rateLimit";
import { previewRequestSchema, revisedAssignmentSchema } from "@/lib/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = previewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "과제 지문, 학습 목표, 그리고 최소 하나의 완전한 개선안을 제공해주세요." },
      { status: 400 }
    );
  }

  const rate = checkRateLimit(request, "preview", ANALYSIS_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.message },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const { assignmentText, lockedObjective, repairs } = parsed.data;

  const repairList = repairs
    .map(
      (repair, index) =>
        `${index + 1}. At the step "${repair.action}":\n   Change: ${repair.suggestion}\n   Must still be assessed: ${repair.rigorNote}`
    )
    .join("\n\n");

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: `Rewrite this assignment so a student can read it directly, applying exactly the repairs the educator accepted and nothing else.

Rules:
- Keep the academic content identical. The locked objective below is still assessed in full, at the same level of difficulty. You are changing how students access and demonstrate the learning, never what they must learn.
- Apply only the listed repairs. Do not fix, tidy, shorten, or improve anything the educator did not accept, however tempting.
- Write in the educator's own voice, addressing the student directly. Preserve the original's structure, numbering, and any resource names or links.
- Where a repair removes a requirement, the replacement must carry the same academic weight — an alternative route to demonstrating the same understanding, not an easier one.
- Return the complete assignment, not a diff or a summary.

<locked_objective>
${lockedObjective}
</locked_objective>

<accepted_repairs>
${repairList}
</accepted_repairs>

<original_assignment>
${assignmentText}
</original_assignment>`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(revisedAssignmentSchema),
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const revised = parseStructured(revisedAssignmentSchema, response.text);
    if (!revised) {
      return NextResponse.json(
        { error: "수정된 과제 생성 결과가 비어 있습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json(revised);
  } catch (error) {
    console.error("preview generation failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
