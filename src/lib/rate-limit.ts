import { env, features } from "./env";
import { AppError } from "./errors";

/**
 * Sliding-window rate limiting. Uses Upstash Redis when configured, otherwise an
 * in-memory fallback (single instance / local dev only).
 */

type Result = { success: boolean; remaining: number; reset: number };

interface Limiter {
  limit(key: string): Promise<Result>;
}

class MemoryLimiter implements Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  async limit(key: string): Promise<Result> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) {
      // opportunistic cleanup
      for (const [k, v] of this.hits) {
        if (v.every((t) => t <= windowStart)) this.hits.delete(k);
      }
    }
    const success = arr.length <= this.max;
    return {
      success,
      remaining: Math.max(0, this.max - arr.length),
      reset: now + this.windowMs,
    };
  }
}

async function makeUpstashLimiter(
  max: number,
  window: `${number} ${"s" | "m" | "h"}`,
): Promise<Limiter> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    prefix: "corecrm/rl",
  });
  return {
    async limit(key: string) {
      const r = await rl.limit(key);
      return { success: r.success, remaining: r.remaining, reset: r.reset };
    },
  };
}

const cache = new Map<string, Promise<Limiter>>();

function getLimiter(
  name: string,
  max: number,
  windowMs: number,
  upstashWindow: `${number} ${"s" | "m" | "h"}`,
): Promise<Limiter> {
  const existing = cache.get(name);
  if (existing) return existing;
  const p = features.distributedRateLimit
    ? makeUpstashLimiter(max, upstashWindow)
    : Promise.resolve(new MemoryLimiter(max, windowMs));
  cache.set(name, p);
  return p;
}

export const rateLimiters = {
  auth: () => getLimiter("auth", 10, 60_000, "10 m" as const),
  passwordReset: () => getLimiter("pwreset", 5, 60_000 * 15, "5 m" as const),
  invitationAccept: () => getLimiter("invite", 10, 60_000 * 10, "10 m" as const),
  api: () => getLimiter("api", 120, 60_000, "120 s" as const),
  upload: () => getLimiter("upload", 30, 60_000, "30 s" as const),
  emailSend: () => getLimiter("emailsend", 30, 60_000 * 5, "30 s" as const),
  webhook: () => getLimiter("webhook", 600, 60_000, "600 s" as const),
};

/** Throws AppError("RATE_LIMITED") when the key is over budget. */
export async function enforceRateLimit(
  limiter: Promise<Limiter>,
  key: string,
): Promise<void> {
  const l = await limiter;
  const r = await l.limit(key);
  if (!r.success) {
    throw new AppError("RATE_LIMITED", undefined, {
      details: { retryAfter: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)) },
    });
  }
}
