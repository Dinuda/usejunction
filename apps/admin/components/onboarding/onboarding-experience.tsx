"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Laptop, Loader2, Users } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { DeviceConnectCard } from "@/components/onboarding/device-connect-card";
import { InviteTeamForm } from "@/components/onboarding/invite-team-form";
import { hasToolBrandIcon, ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";
import { canManageSettings } from "@/lib/rbac/permissions";

type OnboardingStatus = {
  configured: boolean;
  role?: string | null;
  organization?: { name: string; slug: string };
  developer?: {
    devices: Array<{
      id: string;
      hostname: string;
      os: string;
      lastSeenAt: string;
      toolInstallations: Array<{ toolName: string; version?: string | null }>;
    }>;
  } | null;
};

type Path = "choose" | "connect" | "invite";

function TextLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  onClick,
  primary = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[9.5rem] flex-1 flex-col items-start gap-4 border p-4 text-left transition-colors",
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center border",
          primary
            ? "border-primary-foreground/25 bg-primary-foreground/10"
            : "border-border bg-muted/50",
        )}
      >
        <Icon className={cn("size-4", primary ? "text-primary-foreground" : "text-primary")} />
      </span>
      <span className="mt-auto space-y-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {title}
          <ArrowRight
            className={cn(
              "size-3.5 transition-transform group-hover:translate-x-0.5",
              primary ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          />
        </span>
        <span
          className={cn(
            "block text-xs leading-5",
            primary ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {description}
        </span>
      </span>
    </button>
  );
}

export function OnboardingExperience() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [path, setPath] = useState<Path>("choose");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/onboarding", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function finish(action: "complete" | "skip" = "complete") {
    setFinishing(true);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    window.location.href = "/dashboard";
  }

  if (loading || !status) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Workspace setup"
        title="Loading your workspace."
        description="Checking devices and membership."
        statement="Visibility before control."
      >
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </AuthShell>
    );
  }

  const isFounder = canManageSettings(status.role as "owner" | "admin" | "manager" | "user" | null);
  const workspaceName = status.organization?.name ?? "your workspace";
  // Only treat as connected once the agent has reported detected tools —
  // enroll alone is too early (install still detecting/configuring).
  const device = status.developer?.devices.find(
    (item) => (item.toolInstallations?.length ?? 0) > 0,
  );
  const connectedTools = device
    ? [...new Set(device.toolInstallations.map((tool) => canonicalToolKey(tool.toolName)).filter(hasToolBrandIcon))]
    : [];

  if (device) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connected"
        title={`${device.hostname} is live.`}
        description={`Reporting to ${workspaceName}. Open the dashboard to see tools and spend.`}
        statement="First signal. Then the rest."
      >
        <div className="space-y-5">
          <div className="border border-border bg-card px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-primary">Device</p>
            <p className="mt-2 text-sm font-medium">{device.hostname}</p>
            <p className="mt-1 text-xs text-muted-foreground">{device.os} · just now</p>
            {connectedTools.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {connectedTools.map((toolKey) => (
                  <ToolLogoTile key={toolKey} tool={toolKey} size="sm" />
                ))}
              </div>
            )}
          </div>
          <Button className="w-full" onClick={() => void finish()} disabled={finishing}>
            {finishing ? <Loader2 className="animate-spin" /> : null}
            Open dashboard
            <ArrowRight />
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (path === "connect" || !isFounder) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Connect"
        title="Run this in Terminal."
        description="Copy the command. We’ll detect the machine automatically."
        statement="One command. Real data."
      >
        <div className="space-y-5">
          <DeviceConnectCard
            compact
            onConnected={() => {
              // Refresh UI only — do not mark onboarding complete or redirect yet.
              // User clicks Open dashboard after tools are detected.
              void refresh();
            }}
          />
          <p className="font-mono text-[0.65rem] text-muted-foreground">
            Enrollment code · expires in 15 minutes
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-1">
            {isFounder ? (
              <TextLink onClick={() => setPath("invite")}>Invite the team instead</TextLink>
            ) : null}
            <TextLink onClick={() => void finish("skip")} disabled={finishing}>
              Skip for now
            </TextLink>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (path === "invite") {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        eyebrow="Invite"
        title="Share a link."
        description={`Teammates join ${workspaceName}, connect a machine, and show up here.`}
        statement="Visibility before control."
      >
        <div className="space-y-5">
          <InviteTeamForm onInvited={() => void finish()} />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <TextLink onClick={() => setPath("connect")}>Connect a computer instead</TextLink>
            <TextLink onClick={() => void finish("skip")} disabled={finishing}>
              Skip for now
            </TextLink>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Workspace setup"
      title={workspaceName}
      description="Connect this computer or invite the team. You can rename the workspace anytime from settings."
      statement="Visibility before control."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <ChoiceCard
          primary
          icon={Laptop}
          title="Connect this computer"
          description="Install the agent and start reporting tools."
          onClick={() => setPath("connect")}
        />
        <ChoiceCard
          icon={Users}
          title="Invite the team"
          description="Share a join link for teammates."
          onClick={() => setPath("invite")}
        />
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        You can do the other step later.{" "}
        <TextLink onClick={() => void finish("skip")} disabled={finishing}>
          Skip for now
        </TextLink>
      </p>
    </AuthShell>
  );
}
