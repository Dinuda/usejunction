import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { addOAuthAccountConflictContext } from "@/lib/auth/oauth-account-conflict";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const response = await handlers.GET(request);
  const contextualized = addOAuthAccountConflictContext(request, response);
  if (request.nextUrl.pathname.endsWith("/session")) {
    contextualized.headers.set("server-timing", `session;dur=${(performance.now() - started).toFixed(1)}`);
    contextualized.headers.set("cache-control", "private, no-store, max-age=0");
  }
  return contextualized;
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/callback/credentials")) {
    const limited = await enforceRateLimit(request, { key: "auth-login", limit: 10, windowSeconds: 60 });
    if (limited !== true) return limited;
  }
  const response = await handlers.POST(request);
  return addOAuthAccountConflictContext(request, response);
}
