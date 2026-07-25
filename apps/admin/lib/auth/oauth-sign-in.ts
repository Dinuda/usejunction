import { signIn } from "next-auth/react";
import type { OAuthProviderId } from "@/lib/auth/oauth-account-conflict";

let oauthSignInInFlight = false;

/** @internal Test helper */
export function resetOAuthSignInGuardForTests() {
  oauthSignInInFlight = false;
}

export function isOAuthSignInInFlight(): boolean {
  return oauthSignInInFlight;
}

/**
 * Starts OAuth sign-in at most once per page load. Auth.js stores PKCE/state in
 * cookies when sign-in begins; a second concurrent call overwrites them and
 * breaks the callback with CallbackRouteError / error=Configuration.
 */
export async function startOAuthSignIn(
  provider: OAuthProviderId,
  callbackUrl: string,
): Promise<boolean> {
  if (oauthSignInInFlight) return false;
  oauthSignInInFlight = true;

  try {
    const result = (await signIn(provider, { callbackUrl })) as { error?: string } | undefined;
    if (result?.error) {
      oauthSignInInFlight = false;
      return false;
    }
    return true;
  } catch {
    oauthSignInInFlight = false;
    return false;
  }
}
