import type { PlanUsageDeveloperPlanRow, PlanUsageV1 } from "@/lib/insights/contracts/plan-usage.v1";
import { verdictLabel, type PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import { ToolLogoTile } from "@/components/tools/tool-brand-icon";
import { canonicalToolKey } from "@/lib/tools/catalog";
import { quotaResetLabel, quotaWindowLabel } from "@/lib/quotas/display";
import { cn } from "@/lib/utils";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value);
}

function microsToDollars(micros: string) {
  return Number(BigInt(micros)) / 1_000_000;
}

function toolLabel(tool: string) {
  const key = canonicalToolKey(tool);
  return key === "chatgpt-codex"
    ? "ChatGPT"
    : key === "github-copilot"
      ? "Copilot"
      : key
        ? key.charAt(0).toUpperCase() + key.slice(1)
        : "Tool";
}

function toneForVerdict(code: PlanVerdictCode) {
  switch (code) {
    case "LIGHT_USE":
      return "text-muted-foreground";
    case "HEALTHY":
      return "text-primary";
    case "NEAR_LIMIT":
      return "text-brand-yellow-dark";
    case "LIMIT_EXCEEDED":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function barTone(ratio: number | null, code: PlanVerdictCode) {
  if (ratio == null) return "bg-muted";
  if (code === "LIMIT_EXCEEDED") return "bg-destructive";
  if (code === "NEAR_LIMIT") return "bg-brand-yellow-dark";
  if (code === "LIGHT_USE") return "bg-muted-foreground/35";
  return "bg-primary";
}

function PlanRow({ plan }: { plan: PlanUsageDeveloperPlanRow }) {
  const displayPercent =
    plan.primaryQuota?.displayRatio != null
      ? plan.primaryQuota.displayRatio * 100
      : plan.included?.displayRatio != null
        ? plan.included.displayRatio * 100
        : null;
  const rawPercent = plan.primaryRatio != null ? plan.primaryRatio * 100 : null;

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ToolLogoTile tool={plan.toolName} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {toolLabel(plan.toolName)} · {plan.planName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {money(microsToDollars(plan.cycleSeatMicros))}/cycle seat
              {Number(plan.includedCycleMicros) > 0
                ? ` · ${money(microsToDollars(plan.includedCycleMicros))} included`
                : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-semibold tabular-nums", toneForVerdict(plan.verdict.code))}>
            {rawPercent != null ? `${rawPercent.toFixed(0)}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{verdictLabel(plan.verdict.code)}</p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full bg-muted">
        <div
          className={cn("h-full transition-[width]", barTone(plan.primaryRatio, plan.verdict.code))}
          style={{
            width: `${displayPercent != null ? Math.min(100, Math.max(2, displayPercent)) : 0}%`,
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
            Live quota
          </p>
          {plan.quotas.length ? (
            <ul className="mt-2 space-y-1.5">
              {plan.quotas.map((quota) => (
                <li
                  key={quota.quotaKey}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground">{quotaWindowLabel(quota.windowType)}</span>
                  <span className="tabular-nums font-medium">
                    {quota.rawRatio != null ? `${(quota.rawRatio * 100).toFixed(0)}%` : "—"}
                    {quotaResetLabel(quota.resetsAt) ? ` · ${quotaResetLabel(quota.resetsAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Waiting for the agent to report a quota window.
            </p>
          )}
        </div>

        <div className="border-l-2 border-border-strong pl-3">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
            Included allowance
          </p>
          {plan.included && Number(plan.included.includedCycleMicros) > 0 ? (
            <div className="mt-2">
              <p className="text-sm font-medium tabular-nums">
                {money(microsToDollars(plan.included.grossUsageMicros))} of{" "}
                {money(microsToDollars(plan.included.includedCycleMicros))}
                {plan.included.rawRatio != null
                  ? ` · ${(plan.included.rawRatio * 100).toFixed(0)}%`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Estimated usage vs plan include
                {plan.billing ? ` · ${plan.billing.cycleStart} to ${plan.billing.cycleEnd}` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              This plan has no metered include — seat cost only.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function MemberPlanUsage({
  data,
  developerName,
}: {
  data: PlanUsageV1;
  developerName: string;
}) {
  const developer = data.developers[0];
  const plans = developer?.plans ?? [];
  const avg = data.summary.avgUtilizationPercent;

  if (!plans.length) {
    return (
      <section>
        <div className="mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">Plan usage.</h2>
          <p className="mt-1 text-xs text-muted-foreground">How well assigned seats are being used.</p>
        </div>
        <p className="py-4 text-sm text-muted-foreground">
          Assign a plan below to track live quota and included allowance for {developerName}.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Plan usage.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Live vendor quotas and included allowance — scored server-side.
          </p>
        </div>
        {avg != null ? (
          <p
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums",
              toneForVerdict(developer?.verdict.code ?? "UNKNOWN"),
            )}
          >
            {avg.toFixed(0)}% · {verdictLabel(developer?.verdict.code ?? "UNKNOWN")}
          </p>
        ) : null}
      </div>

      <ul className="divide-y">
        {plans.map((plan) => (
          <PlanRow key={plan.assignmentId} plan={plan} />
        ))}
      </ul>
    </section>
  );
}
