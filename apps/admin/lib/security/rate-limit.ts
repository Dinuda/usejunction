import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { clientIp } from "./http";
import { logServerError } from "@/lib/errors/public";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export async function enforceRateLimit(req: Request, options: RateLimitOptions): Promise<true | NextResponse> {
  const now = new Date();
  const windowMs = options.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const key = `${options.key}:${clientIp(req)}`.slice(0, 256);

  try {
    const bucket = await prisma.rateLimitBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: 1 }, updatedAt: now },
      create: { key, windowStart, count: 1, expiresAt: new Date(windowStart.getTime() + windowMs), updatedAt: now },
    });
    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000));
      return NextResponse.json(
        { error: "too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    return true;
  } catch (error) {
    logServerError("rate-limit", error);
    return true;
  }
}
