"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  token: string;
  emailMasked: string;
  signedIn: boolean;
  sessionEmail: string | null;
};

export function ConnectInviteClient({ token, emailMasked, signedIn, sessionEmail }: Props) {
  const [status, setStatus] = useState<"idle" | "completing" | "ready" | "error">(signedIn ? "completing" : "idle");
  const [error, setError] = useState<string | null>(null);
  const callbackUrl = `/connect-invite/${token}`;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      setStatus("completing");
      const response = await fetch(`/api/connect-invite/${encodeURIComponent(token)}/complete`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setError(data.error ?? "Could not complete connect invite.");
        setStatus("error");
        return;
      }
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, token]);

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
        Confirming {emailMasked}…
      </div>
    );
  }

  const hasOAuth = getEnabledOAuthProviders().length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Continue as <span className="font-medium text-foreground">{emailMasked}</span>.
      </p>
      {sessionEmail ? <p className="text-xs text-muted-foreground">Signed in as {sessionEmail}.</p> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <OAuthProviderButtons callbackUrl={callbackUrl} showEmailDivider={hasOAuth} emailDividerLabel="or use email" />
      <Button asChild className="w-full">
        <a href={`/login?from=${encodeURIComponent(callbackUrl)}`}>
          {hasOAuth ? "Use work email" : "Sign in to continue"}
        </a>
      </Button>
    </div>
  );
}
