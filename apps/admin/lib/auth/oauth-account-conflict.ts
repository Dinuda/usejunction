import type { NextRequest } from "next/server";

export const OAUTH_PROVIDER_LABELS = {
  google: "Google",
  github: "GitHub",
  "microsoft-entra-id": "Microsoft",
} as const;

export type OAuthProviderId = keyof typeof OAUTH_PROVIDER_LABELS;

export function isOAuthProviderId(value: string | null | undefined): value is OAuthProviderId {
  return Boolean(value && value in OAUTH_PROVIDER_LABELS);
}

export function isOAuthAccountNotLinkedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "type" in error && error.type === "OAuthAccountNotLinked";
}

export function safeAuthReturnPath(value: string | null | undefined): string {
  if (!value) return "/dashboard";

  try {
    const baseUrl = new URL("https://auth-return.invalid");
    const url = new URL(value, baseUrl);
    if (url.origin !== baseUrl.origin || !value.startsWith("/") || value.startsWith("//")) {
      return "/dashboard";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

function callbackPath(request: NextRequest): string | null {
  const cookie =
    request.cookies.get("__Secure-authjs.callback-url")?.value ??
    request.cookies.get("authjs.callback-url")?.value;

  if (!cookie) return null;

  try {
    const url = new URL(cookie, request.nextUrl.origin);
    if (url.origin !== request.nextUrl.origin) return null;
    return safeAuthReturnPath(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return null;
  }
}

/**
 * Auth.js intentionally exposes only the public error type. Add non-sensitive
 * context from the callback request so the error page can offer the right
 * recovery action and retain invite/deep-link destinations.
 */
export function addOAuthAccountConflictContext(request: NextRequest, response: Response): Response {
  const match = request.nextUrl.pathname.match(/\/api\/auth\/callback\/([^/]+)\/?$/);
  const provider = match?.[1];
  if (!isOAuthProviderId(provider)) return response;

  const location = response.headers.get("location");
  if (!location) return response;

  const errorUrl = new URL(location, request.nextUrl.origin);
  if (
    errorUrl.origin !== request.nextUrl.origin ||
    errorUrl.pathname !== "/auth/error" ||
    errorUrl.searchParams.get("error") !== "OAuthAccountNotLinked"
  ) {
    return response;
  }

  errorUrl.searchParams.set("provider", provider);
  const from = callbackPath(request);
  if (from) errorUrl.searchParams.set("from", from);

  const headers = new Headers(response.headers);
  headers.set("location", errorUrl.toString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
