"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  organizationName: string;
  signedIn: boolean;
  sessionEmail: string | null;
};

type RedeemState =
  | { kind: "idle" }
  | { kind: "redeeming" }
  | { kind: "ready"; installCommand: string; email: string }
  | { kind: "error"; message: string };

export function TeamInviteClient({ token, organizationName, signedIn, sessionEmail }: Props) {
  const [state, setState] = useState<RedeemState>(signedIn ? { kind: "redeeming" } : { kind: "idle" });
  const [copied, setCopied] = useState(false);
  const callbackUrl = `/i/${token}`;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      setState({ kind: "redeeming" });
      const response = await fetch(`/api/i/${encodeURIComponent(token)}/redeem`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setState({ kind: "error", message: data.error ?? "Could not redeem invite." });
        return;
      }
      setState({
        kind: "ready",
        installCommand: data.installCommand as string,
        email: (data.email as string) ?? sessionEmail ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, token, sessionEmail]);

  async function copyCommand(command: string) {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (state.kind === "ready") {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connect"
        title="Run this in Terminal."
        description={`Copy the command to finish joining ${organizationName}.`}
        statement="One command. Real data."
      >
        <div className="space-y-5">
          <div className="relative overflow-hidden border border-brand-olive bg-brand-olive p-4 pr-14 font-mono text-xs leading-6 text-primary-foreground">
            <code className="break-all">{state.installCommand}</code>
            <button
              type="button"
              className={cn(
                "absolute right-3 top-3 border border-brand-olive-border p-2 text-primary-foreground/80 transition hover:bg-brand-olive-secondary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={() => void copyCommand(state.installCommand)}
              aria-label="Copy install command"
            >
              {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
            </button>
          </div>
          <p className="font-mono text-[0.65rem] text-muted-foreground">
            {copied ? "Copied — paste in Terminal" : "Metadata only · paste in Terminal"}
          </p>
          <div className="flex justify-center pt-1">
            <a
              href="/onboarding"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Continue to workspace
            </a>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (state.kind === "redeeming") {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Join"
        title={`Join ${organizationName}.`}
        description="Confirming your invite…"
        statement="Visibility before control."
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Checking your invite…
        </div>
      </AuthShell>
    );
  }

  const hasOAuth = getEnabledOAuthProviders().length > 0;
  const errorMessage = state.kind === "error" ? state.message : null;

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Join"
      title={`Join ${organizationName}.`}
      description="Sign in with your work email, then connect this machine."
      statement="Visibility before control."
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <OAuthProviderButtons callbackUrl={callbackUrl} showEmailDivider={hasOAuth} emailDividerLabel="or use email" />
        <div className="space-y-3">
          <Button asChild className="w-full">
            <a href={`/signup?from=${encodeURIComponent(callbackUrl)}`}>Create account</a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <a href={`/login?from=${encodeURIComponent(callbackUrl)}`}>Sign in</a>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
