import { NextResponse } from "next/server";

import { locateEvidence } from "@/lib/evidenceGuard";
import { describeModelFailure, generateStructured } from "@/lib/openai";
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

  const { assignmentText, lockedObjective, repairs, steps } = parsed.data;
  const stepList = steps.map((step) => `- ${step.id}: ${step.action}`).join("\n") || "none";

  const repairList = repairs
    .map(
      (repair, index) =>
        `${index + 1}. At the step "${repair.action}":\n   Change: ${repair.suggestion}\n   Must still be assessed: ${repair.rigorNote}`
    )
    .join("\n\n");

  try {
    const revised = await generateStructured({
      name: "revised_assignment",
      prompt: `Rewrite this assignment so a student can read it directly, applying exactly the repairs the educator accepted and nothing else.

Rules:
- Keep the academic content identical. The locked objective below is still assessed in full, at the same level of difficulty. You are changing how students access and demonstrate the learning, never what they must learn.
- Apply only the listed repairs. Do not fix, tidy, shorten, or improve anything the educator did not accept, however tempting.
- Write in the educator's own voice, addressing the student directly. Preserve the original's structure, numbering, and any resource names or links.
- Where a repair removes a requirement, the replacement must carry the same academic weight — an alternative route to demonstrating the same understanding, not an easier one.
- Return the complete assignment, not a diff or a summary.
- Then, for each step in the step list, copy into stepExcerpts the sentence or clause of YOUR revisedText that tells the student to do that step, character-for-character. Leave out steps your revisedText does not mention. Never paraphrase: an excerpt that is not found verbatim in revisedText is discarded.

<locked_objective>
${lockedObjective}
</locked_objective>

<accepted_repairs>
${repairList}
</accepted_repairs>

<steps>
${stepList}
</steps>

<original_assignment>
${assignmentText}
</original_assignment>`,
      schema: revisedAssignmentSchema,
      effort: "minimal",
      maxOutputTokens: 6000,
    });
    if (!revised) {
      return NextResponse.json(
        { error: "수정된 과제 생성 결과가 비어 있습니다. 다시 시도해주세요." },
        { status: 502 }
      );
    }

    // Only excerpts that really are in the rewrite, for steps that really exist.
    const knownStepIds = new Set(steps.map((step) => step.id));
    const seen = new Set<string>();
    const stepExcerpts = revised.stepExcerpts.filter((entry) => {
      if (!knownStepIds.has(entry.stepId) || seen.has(entry.stepId)) return false;
      if (!locateEvidence(revised.revisedText, entry.excerpt.trim())) return false;
      seen.add(entry.stepId);
      return true;
    });

    return NextResponse.json({ ...revised, stepExcerpts });
  } catch (error) {
    console.error("preview generation failed", error);
    const failure = describeModelFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
