"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
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
  onboardingCompletedAt?: string | null;
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
  iconSrc,
  title,
  description,
  onClick,
  primary = false,
  dark = false,
}: {
  iconSrc: string;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[9.5rem] flex-1 flex-col items-start gap-4 border p-4 text-left transition-colors",
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : dark
            ? "border-neutral-500 border-1 text-black hover:bg-neutral-200/90 transparent"
            : "border-neutral-500 bg-neutral-50 hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <Image src={iconSrc} alt="" width={36} height={36} className="size-9 shrink-0" />
      <span className="mt-auto space-y-1.5">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {title}
          <ArrowRight
            className={cn(
              "size-3.5 transition-transform group-hover:translate-x-0.5",
              primary
                ? "text-primary-foreground/80"
                : dark
                  ? "text-black/80"
                  : "text-muted-foreground",
            )}
          />
        </span>
        <span
          className={cn(
            "block text-xs leading-5",
            primary
              ? "text-primary-foreground/80"
              : dark
                ? "text-black/80"
                : "text-muted-foreground",
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
  const [invitePending, setInvitePending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [path, setPath] = useState<Path>("choose");

  const refresh = useCallback(async (mode: "bootstrap" | "poll" = "poll") => {
    const response =
      mode === "bootstrap"
        ? await fetch("/api/onboarding", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              "x-requested-with": "usejunction-web",
            },
            body: "{}",
            cache: "no-store",
          })
        : await fetch("/api/onboarding?include=developer", { cache: "no-store" });

    if (response.status === 401) {
      window.location.href = "/login?from=/onboarding";
      return;
    }
    if (response.status === 409) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (body?.error === "invite_pending") {
        setInvitePending(true);
        setLoading(false);
        return;
      }
    }

    const next = response.ok ? await response.json() as OnboardingStatus : null;
    if (next?.onboardingCompletedAt) {
      window.location.href = "/dashboard";
      return;
    }
    if (next) setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh("bootstrap");
  }, [refresh]);

  async function finish(action: "complete" | "skip" = "complete") {
    setFinishing(true);
    await fetch("/api/onboarding", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "usejunction-web",
      },
      body: JSON.stringify({ action }),
    });
    window.location.href = "/dashboard";
  }

  if (invitePending) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        title="Finish your invite first."
        description="Open the invite link from your email or teammate before setting up a personal workspace."
        statement="Visibility before control."
      >
        <p className="text-sm text-muted-foreground">
          Creating a personal workspace is blocked while you have an open invite.
        </p>
      </AuthShell>
    );
  }

  if (loading || !status) {
    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
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
        title={`${device.hostname} is live.`}
        description={`Reporting to ${workspaceName}. Open the dashboard to see tools and spend.`}
        statement="First signal. Then the rest."
      >
        <div className="space-y-5">
          <div className="border border-border bg-card px-4 py-3">
            <p className="text-sm font-medium">{device.hostname}</p>
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
        title="Run this in Terminal."
        description="Copy the command and paste it in Terminal. We’ll detect the machine automatically."
        statement="One command. Real data."
      >
        <div className="space-y-5">
          <DeviceConnectCard
            compact
            onConnected={() => {
              // Refresh UI only — do not mark onboarding complete or redirect yet.
              // User clicks Open dashboard after tools are detected.
              void refresh("poll");
            }}
          />
          <div className="space-y-1 pt-2 text-center text-sm text-muted-foreground">
            {isFounder ? (
              <button
                type="button"
                onClick={() => setPath("invite")}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                Invite the team instead
              </button>
            ) : null}
            <div>
              <TextLink onClick={() => void finish("skip")} disabled={finishing}>
                Skip for now
              </TextLink>
            </div>
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
        title="Invite teammates."
        description="Invite someone else to help you build out the workspace."
        statement="Visibility before control."
      >
        <div className="space-y-6">
          <InviteTeamForm variant="dashboard" onInvited={() => void finish()} />
          <div className="space-y-1 pt-2 text-center text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => setPath("connect")}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Connect a computer instead
            </button>
            <div>
              <TextLink onClick={() => void finish("skip")} disabled={finishing}>
                Skip for now
              </TextLink>
            </div>
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
      title={workspaceName}
      description="Connect this computer or invite the team. You can rename the workspace anytime from settings."
      statement="Visibility before control."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <ChoiceCard
          primary
          iconSrc="/images/laptop-tile.png"
          title="Connect this computer"
          description="Install the agent and start reporting tools."
          onClick={() => setPath("connect")}
        />
        <ChoiceCard
          dark
          iconSrc="/images/person-tile.png"
          title="Invite the team"
          description="Share a join link for teammates."
          onClick={() => setPath("invite")}
        />
      </div>
      <div className="mt-5 space-y-1 text-center text-sm text-muted-foreground">
        <p>You can invite your team later.</p>
        <TextLink onClick={() => void finish("skip")} disabled={finishing}>
          Skip for now
        </TextLink>
      </div>
    </AuthShell>
  );
}
