import { isLoopbackHostname, validateHttpsUnlessLoopback } from "@/lib/security/env-guard";

type RequestLike = { url: string } | URL | string;

function configuredPublicAppUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  const value = configured.replace(/\/$/, "") || "http://localhost:3001";
  const problem = validateHttpsUnlessLoopback("public app URL", value);
  if (problem && process.env.NODE_ENV === "production") throw new Error(problem);
  return value;
}

function forceConfiguredAppUrl() {
  return process.env.USEJUNCTION_USE_CONFIGURED_APP_URL === "true";
}

function originFromRequest(request: RequestLike): string | null {
  try {
    if (typeof request === "string") return new URL(request).origin;
    if (request instanceof URL) return request.origin;
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

/**
 * Public control-plane URL for install/enroll commands.
 *
 * When the incoming request is loopback (localhost), prefer that origin so a
 * local `next start` / `next dev` session does not enroll agents against a
 * production NEXT_PUBLIC_APP_URL from `.env.production`.
 *
 * Set USEJUNCTION_USE_CONFIGURED_APP_URL=true to always use the configured URL
 * (e.g. force prod commands while browsing localhost).
 */
export function getPublicAppUrl(request?: RequestLike) {
  const configured = configuredPublicAppUrl();
  if (!request || forceConfiguredAppUrl()) return configured;

  const origin = originFromRequest(request);
  if (!origin) return configured;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return configured;
  }

  if (isLoopbackHostname(hostname)) {
    return origin.replace(/\/$/, "");
  }

  return configured;
}
