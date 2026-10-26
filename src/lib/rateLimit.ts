/**
 * Best-effort rate limiting for a locally-run instance on a free Gemini key.
 *
 * State lives in the process's memory, so this is a speed bump rather than a
 * guarantee. Its job here is not to stop abuse from strangers — this never
 * runs anywhere but localhost — it is to stop an accidental double-click or a
 * refresh loop from quietly burning through a free-tier daily quota during a
 * demo. The numbers are intentionally conservative for that reason.
 */

interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();

export interface Limit {
  /** Requests allowed per window, per caller. */
  perCaller: number;
  /** Requests allowed per window across every caller this instance sees. */
  global: number;
  windowMs: number;
}

export const ANALYSIS_LIMIT: Limit = {
  perCaller: 6,
  global: 6,
  windowMs: 60 * 60 * 1000,
};

export const LIGHT_LIMIT: Limit = {
  perCaller: 15,
  global: 15,
  windowMs: 60 * 60 * 1000,
};

export function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

function record(key: string, windowMs: number, limit: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((at) => now - at < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  // Keep the map from growing without bound on a long-lived instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.hits.every((at) => now - at >= windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export interface RateDecision {
  allowed: boolean;
  message: string;
  retryAfterSeconds: number;
}

export function checkRateLimit(request: Request, scope: string, limit: Limit): RateDecision {
  const caller = record(`${scope}:${callerKey(request)}`, limit.windowMs, limit.perCaller);
  if (!caller.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: caller.retryAfterSeconds,
      message: `무료 API 한도를 아끼기 위해 시간당 ${limit.perCaller}회로 제한하고 있습니다. 약 ${Math.ceil(caller.retryAfterSeconds / 60)}분 후 다시 시도해주세요.`,
    };
  }

  const overall = record(`${scope}:__all__`, limit.windowMs, limit.global);
  if (!overall.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: overall.retryAfterSeconds,
      message: "이번 시간대 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  return { allowed: true, message: "", retryAfterSeconds: 0 };
}
