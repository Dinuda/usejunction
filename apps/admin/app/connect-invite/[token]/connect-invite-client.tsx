"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/errors/user-facing";

type Props = {
  token: string;
  email: string;
  signedIn: boolean;
  sessionEmail: string | null;
};

export function ConnectInviteClient({ token, email, signedIn, sessionEmail }: Props) {
  const [status, setStatus] = useState<"idle" | "completing" | "ready" | "error">(signedIn ? "completing" : "idle");
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = `/connect-invite/${token}`;

  useEffect(() => {
    if (!signedIn) return;
    if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
      setStatus("idle");
      setError(`Sign in as ${email} to continue. You are signed in as ${sessionEmail}.`);
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatus("completing");
      const response = await fetch(`/api/connect-invite/${encodeURIComponent(token)}/complete`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setError(userFacingError(data.error, "Could not complete connect invite."));
        setStatus("error");
        return;
      }
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, token, email, sessionEmail]);

  if (status === "ready") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Check className="size-4 shrink-0 text-success" />
          You&apos;re in — return to Terminal.
        </div>
        <p className="text-sm text-muted-foreground">
          Enrollment finishes automatically in the terminal where you ran the connect command.
        </p>
      </div>
    );
  }

  if (status === "completing") {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Confirming {email}…
      </div>
    );
  }

  const hasOAuth = getEnabledOAuthProviders().length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Continue as <span className="font-medium text-foreground">{email}</span>.
      </p>
      {sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase() ? (
        <Alert variant="destructive">
          <AlertDescription>
            Signed in as {sessionEmail}. Sign out and continue as {email}.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <OAuthProviderButtons callbackUrl={callbackUrl} showEmailDivider={hasOAuth} emailDividerLabel="or use email" />
      <Button asChild className="w-full">
        <a href={`/login?from=${encodeURIComponent(callbackUrl)}&email=${encodeURIComponent(email)}`}>
          {hasOAuth ? "Use work email" : "Sign in to continue"}
        </a>
      </Button>
    </div>
  );
}
