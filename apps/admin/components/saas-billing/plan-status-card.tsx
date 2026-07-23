"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillingNavigation } from "@/components/saas-billing/use-billing-navigation";
import { cn } from "@/lib/utils";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";

type PlanStatusCardProps = {
  billing: OrgBillingStatus;
  onNavigate?: () => void;
};

export function shouldShowSidebarPlanCard(billing: OrgBillingStatus) {
  const paid = billing.effectivePlan === "team" || billing.effectivePlan === "enterprise";

  if (!paid) return true;

  return billing.subscriptionStatus === "cancelled" || billing.subscriptionStatus === "paused";
}

export function ActivePlanBadge({ billing, onNavigate }: PlanStatusCardProps) {
  const icon = <Settings className="size-3.5" aria-hidden="true" />;
  return (
    <div
      className="mb-2 flex w-full items-stretch rounded-none border border-border/80 bg-muted/30"
      aria-label={`Current plan: ${billing.planLabel}`}
    >
      {billing.canManage ? (
        <Link
          href="/settings#settings-billing"
          className="flex shrink-0 items-center justify-center border-r border-border/80 px-2.5 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Billing settings"
          onClick={onNavigate}
        >
          {icon}
        </Link>
      ) : (
        <span
          className="flex shrink-0 items-center justify-center border-r border-border/80 px-2.5 py-2 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="flex flex-1 items-center px-3 py-2 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {billing.planLabel} plan
      </div>
    </div>
  );
}

function statusLine(billing: OrgBillingStatus) {
  if (billing.seatSyncPending && billing.canManage) {
    return "Billing sync pending — retrying automatically";
  }

  if (billing.isAtUserLimit && !billing.canManage) {
    return "User limit reached — upgrade to add more";
  }

  if (billing.effectivePlan === "team" || billing.effectivePlan === "enterprise") {
    if (billing.subscriptionStatus === "cancelled") return "Cancels at period end";
    return "Active subscription";
  }

  return "Free tier";
}

export function PlanStatusCard({ billing }: PlanStatusCardProps) {
  const { error, loading, openPortal } = useBillingNavigation();

  const paid = billing.effectivePlan === "team" || billing.effectivePlan === "enterprise";
  const usageLabel = paid
    ? `${billing.usersUsed} active user${billing.usersUsed === 1 ? "" : "s"}`
    : billing.usersLimit === null
      ? `${billing.usersUsed} user${billing.usersUsed === 1 ? "" : "s"}`
      : `${billing.usersUsed} / ${billing.usersLimit} users`;

  return (
    <div
      className="uj-grid-texture relative overflow-hidden rounded-xl text-white shadow-[0_10px_24px_-10px_rgba(192,104,44,0.35)] [--uj-grid-opacity:0.05]"
      style={{
        backgroundColor: "var(--brand-orange)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-black/10 via-transparent to-transparent" />
      <div className="relative z-10 space-y-3.5 p-4">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/90">Plan</p>
          <p className="mt-1 text-lg font-semibold leading-tight tracking-tight text-white">{billing.planLabel}</p>
          <p className="mt-1 text-sm text-white/90">{statusLine(billing)}</p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/90">
              Users
            </span>
            <span className="tabular-nums text-white">{usageLabel}</span>
          </div>
          {billing.usagePercent !== null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className={cn("h-full rounded-full bg-white transition-all")}
                style={{ width: `${billing.usagePercent}%` }}
              />
            </div>
          )}
          {billing.seatSyncPending && billing.billingSeatQuantity !== null && (
            <p className="mt-2 text-xs text-white/85">
              Lemon currently shows {billing.billingSeatQuantity} seat{billing.billingSeatQuantity === 1 ? "" : "s"}.
            </p>
          )}
        </div>

        {billing.canUpgrade && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="relative z-20 h-9 w-full border-0 bg-white font-semibold shadow-sm hover:bg-[var(--brand-orange-pale)] [background-image:none]"
            style={{ color: "var(--brand-orange-dark)" }}
          >
            <Link href="/settings/upgrade">
              Upgrade to Team
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}

        {billing.canManage && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="relative z-20 h-9 w-full border-0 bg-white font-semibold shadow-sm hover:bg-[var(--brand-orange-pale)] [background-image:none]"
              style={{ color: "var(--brand-orange-dark)" }}
              disabled={loading}
              onClick={openPortal}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Manage billing"}
              {!loading && <ArrowRight className="size-4" />}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-xs font-medium" style={{ color: "var(--brand-orange-pale)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
