"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrgBillingStatus } from "@/lib/billing/status";

type PlanStatusCardProps = {
  billing: OrgBillingStatus;
};

function statusLine(billing: OrgBillingStatus) {
  if (billing.effectivePlan === "trial") {
    if (billing.trialDaysLeft === 0) return "Trial ended";
    if (billing.trialDaysLeft === 1) return "1 day left in trial";
    return `${billing.trialDaysLeft} days left in trial`;
  }

  if (billing.effectivePlan === "team" || billing.effectivePlan === "enterprise") {
    if (billing.subscriptionStatus === "cancelled") return "Cancels at period end";
    return "Active subscription";
  }

  return "Free tier";
}

export function PlanStatusCard({ billing }: PlanStatusCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverageLabel =
    billing.devicesLimit === null
      ? `${billing.devicesUsed} devices enrolled`
      : `${billing.devicesUsed} / ${billing.devicesLimit} devices`;

  async function handleAction() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = billing.canManage ? "/api/billing/portal" : "/api/billing/checkout";
      const response = await fetch(endpoint, { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Billing request failed");
      }
      window.location.href = data.url;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Billing request failed");
      setLoading(false);
    }
  }

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
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white/90">Coverage</span>
            <span className="tabular-nums text-white">{coverageLabel}</span>
          </div>
          {billing.devicesLimit !== null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className={cn("h-full rounded-full bg-white transition-all")}
                style={{ width: `${billing.coveragePercent ?? 0}%` }}
              />
            </div>
          )}
        </div>

        {(billing.canUpgrade || billing.canManage) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="relative z-20 h-9 w-full border-0 bg-white font-semibold shadow-sm hover:bg-[var(--brand-orange-pale)] [background-image:none]"
            style={{ color: "var(--brand-orange-dark)" }}
            disabled={loading}
            onClick={handleAction}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {billing.canManage ? "Manage billing" : "Upgrade to Team"}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
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
