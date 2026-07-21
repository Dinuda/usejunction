"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  OAUTH_PROVIDER_LABELS,
  type OAuthProviderId,
} from "@/lib/auth/oauth-account-conflict";

type OAuthAccountConflictActionsProps = {
  callbackUrl: string;
  provider?: OAuthProviderId;
  signedIn: boolean;
};

export function OAuthAccountConflictActions({
  callbackUrl,
  provider,
  signedIn,
}: OAuthAccountConflictActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginHref = `/login?from=${encodeURIComponent(callbackUrl)}`;

  async function switchAccount() {
    setPending(true);
    setError(null);

    try {
      await signOut({ redirect: false });
      if (provider) {
        await signIn(provider, { callbackUrl });
        return;
      }
      window.location.assign(loginHref);
    } catch {
      setError("We couldn’t sign out of the current account. Refresh the page and try again.");
      setPending(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="mt-6 grid gap-3">
        <Button asChild className="w-full">
          <a href={loginHref}>Return to sign in</a>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href="/forgot-password">Reset your password</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" className="w-full" disabled={pending} onClick={() => void switchAccount()}>
        {pending
          ? "Switching accounts…"
          : provider
            ? `Sign out and continue with ${OAUTH_PROVIDER_LABELS[provider]}`
            : "Sign out and return to sign in"}
      </Button>
      <Button asChild variant="outline" className="w-full">
        <a href={callbackUrl}>Keep using the current account</a>
      </Button>
    </div>
  );
}
