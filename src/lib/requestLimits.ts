import type { ZodError } from "zod";

/**
 * Upper bounds on what a caller can send. Every route interpolates these
 * fields into a model prompt, so an unbounded field is an unbounded bill.
 * The limits sit well above a real assignment: 30,000 characters is roughly
 * twelve pages of dense prose.
 */
export const REQUEST_LIMITS = {
  assignmentChars: 30_000,
  objectiveChars: 500,
  suggestionChars: 2_000,
  repairFieldChars: 2_000,
  repairs: 30,
  steps: 80,
  timers: 30,
  stepIdChars: 100,
  /** Whole request body. The repair route carries the full task graph. */
  bodyBytes: 512 * 1024,
} as const;

const FIELD_LABEL: Record<string, string> = {
  assignmentText: "과제 지문",
  lockedObjective: "학습 목표",
  suggestion: "개선안",
  repairs: "개선안 목록",
  action: "단계 설명",
  rigorNote: "난이도 메모",
  stepId: "단계 식별자",
  steps: "작업 단계",
  timeConstraints: "시간 제한 목록",
  step: "작업 단계",
  analysis: "단계 분석",
};

export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE =
  "요청이 너무 큽니다. 과제 지문을 30,000자 이하로 줄여 다시 시도해 주세요.";

/**
 * Reads a JSON body, stopping as soon as it exceeds the limit rather than
 * buffering whatever the caller sends. A declared Content-Length over the limit
 * is refused before reading anything.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = REQUEST_LIMITS.bodyBytes
): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: TOO_LARGE };
  }
  if (!request.body) return { ok: false, status: 400, error: "요청 본문이 비어 있습니다." };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413, error: TOO_LARGE };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "요청 본문을 읽을 수 없습니다." };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "요청 본문이 올바른 JSON이 아닙니다." };
  }
}

/**
 * A field over its maximum gets a 413 that names the field and the limit; any
 * other validation failure keeps the route's own 400 message.
 */
export function describeValidationFailure(
  error: ZodError,
  fallback: string
): { status: 400 | 413; error: string } {
  const tooBig = error.issues.find((issue) => issue.code === "too_big");
  if (!tooBig) return { status: 400, error: fallback };
  const field = [...tooBig.path].reverse().find((part) => typeof part === "string" && part in FIELD_LABEL);
  const label = typeof field === "string" ? FIELD_LABEL[field] : "입력";
  const maximum = "maximum" in tooBig ? Number(tooBig.maximum) : null;
  const unit = tooBig.origin === "array" ? "개" : "자";
  // Every label is Hangul: pick 이/가 from whether the last syllable has a final consonant.
  const subject = (label.charCodeAt(label.length - 1) - 0xac00) % 28 === 0 ? "가" : "이";
  return {
    status: 413,
    error:
      maximum !== null && Number.isFinite(maximum)
        ? `${label}${subject} 너무 깁니다. ${maximum.toLocaleString("ko-KR")}${unit} 이하로 줄여 주세요.`
        : `${label}${subject} 허용된 길이를 넘었습니다.`,
  };
}

export type ParsedRequest<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string };

/** Reads, size-checks and validates a request body in one place for every route. */
export async function parseBoundedRequest<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: ZodError } },
  fallback: string
): Promise<ParsedRequest<T>> {
  const body = await readJsonBody(request);
  if (!body.ok) return body;
  const parsed = schema.safeParse(body.value);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, ...describeValidationFailure(parsed.error, fallback) };
}
