"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PlatformCommand } from "@/components/onboarding/platform-command";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { userFacingError } from "@/lib/errors/user-facing";
import type { PlatformCommands } from "@/lib/connect-command";
import { activateWorkspace } from "@/lib/api/client";

type Props = {
  token: string;
  organizationName: string;
  signedIn: boolean;
  sessionEmail: string | null;
};

type RedeemState =
  | { kind: "idle" }
  | { kind: "redeeming" }
  | { kind: "ready"; installCommands: PlatformCommands; email: string }
  | { kind: "error"; message: string };

type Device = {
  id: string;
  hostname: string;
  toolInstallations?: Array<{ toolName: string; version?: string | null }>;
};

/** Device is ready once enrolled and the agent has reported at least one tool. */
function isReadyDevice(device: Device | null | undefined): device is Device {
  return Boolean(device && (device.toolInstallations?.length ?? 0) > 0);
}

export function TeamInviteClient({ token, organizationName, signedIn, sessionEmail }: Props) {
  const [state, setState] = useState<RedeemState>(signedIn ? { kind: "redeeming" } : { kind: "idle" });
  const [device, setDevice] = useState<Device | null>(null);
  const [waitingForTools, setWaitingForTools] = useState(false);
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
        setState({ kind: "error", message: userFacingError(data.error, "Could not redeem invite.") });
        return;
      }
      if (typeof data.orgId !== "string") {
        setState({ kind: "error", message: "Could not activate the invited workspace." });
        return;
      }
      try {
        await activateWorkspace(data.orgId);
      } catch {
        setState({ kind: "error", message: "Could not activate the invited workspace." });
        return;
      }
      setState({
        kind: "ready",
        installCommands: (data.installCommands ?? {
          macosLinux: data.installCommand,
          windows: data.installCommand,
        }) as PlatformCommands,
        email: (data.email as string) ?? sessionEmail ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, token, sessionEmail]);

  useEffect(() => {
    if (state.kind !== "ready") return;

    let cancelled = false;
    let intervalId: number | undefined;

    async function refreshStatus() {
      const response = await fetch("/api/onboarding?include=developer", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const data = await response.json();
      const devices = (data.developer?.devices as Device[] | undefined) ?? [];
      const candidate = devices[0] ?? null;

      if (candidate && !isReadyDevice(candidate)) {
        setWaitingForTools(true);
        setDevice(candidate);
        return;
      }

      if (isReadyDevice(candidate)) {
        setWaitingForTools(false);
        setDevice(candidate);
        if (intervalId !== undefined) window.clearInterval(intervalId);
      }
    }

    void refreshStatus();
    intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 2500);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [state.kind]);

  if (state.kind === "ready") {
    const connected = isReadyDevice(device);

    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connect"
        title={connected ? "Device connected." : "Connect this device."}
        description={
          connected
            ? `${device.hostname} is ready. Continue to finish joining ${organizationName}.`
            : `Copy the command to finish joining ${organizationName}.`
        }
        statement="One command. Real data."
      >
        <div className="space-y-5">
          {!connected ? (
            <>
              <PlatformCommand commands={state.installCommands} />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                {waitingForTools
                  ? "Device enrolled — waiting for tool detection…"
                  : "Waiting for enroll…"}
              </div>
              <div className="flex justify-center pt-1">
                <a
                  href="/onboarding"
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Continue without connecting
                </a>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="border border-border bg-card p-4">
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">Connected</p>
                <p className="mt-2 text-sm font-medium">{device.hostname}</p>
              </div>
              <Button asChild className="w-full">
                <a href="/onboarding">Continue to workspace</a>
              </Button>
            </div>
          )}
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
