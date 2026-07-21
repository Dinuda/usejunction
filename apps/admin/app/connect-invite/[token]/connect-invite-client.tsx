"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/errors/user-facing";
import { activateWorkspace } from "@/lib/api/client";

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
      if (typeof data.orgId !== "string") {
        setError("Could not activate the invited workspace.");
        setStatus("error");
        return;
      }
      try {
        await activateWorkspace(data.orgId);
      } catch {
        setError("Could not activate the invited workspace.");
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
