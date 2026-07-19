import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const GET = handlers.GET;

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/callback/credentials")) {
    const limited = await enforceRateLimit(request, { key: "auth-login", limit: 10, windowSeconds: 60 });
    if (limited !== true) return limited;
  }
  return handlers.POST(request);
}
