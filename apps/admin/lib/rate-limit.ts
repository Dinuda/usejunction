import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const globalBuckets = globalThis as typeof globalThis & {
  __usejunctionRateLimits?: Map<string, Bucket>;
};
const buckets = globalBuckets.__usejunctionRateLimits ?? new Map<string, Bucket>();
globalBuckets.__usejunctionRateLimits = buckets;

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function requestClientAddress(req: NextRequest) {
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function consumeRateLimit(scope: string, subject: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${scope}:${fingerprint(subject)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 };
}

export function enforceRateLimit(
  req: NextRequest,
  scope: string,
  options: { limit: number; windowMs: number; identity?: string | null },
) {
  const subject = `${requestClientAddress(req)}:${options.identity?.trim().toLowerCase() ?? ""}`;
  const result = consumeRateLimit(scope, subject, options.limit, options.windowMs);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}
