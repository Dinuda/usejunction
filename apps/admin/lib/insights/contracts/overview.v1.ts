import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type { PlanVerdictCode } from "@/lib/billing/plan-utilization-policy";
import type { AttentionItem } from "@/lib/insights/policies/attention";
import type { BillingCycleInfo } from "@/lib/insights/contracts/plan-usage.v1";

type CycleOverviewInput = {
  cycleView: "current_cycles" | "previous_cycles";
};

type RollingOverviewInput = {
  cycleView: "last_30_days";
  reportWindow: MetricWindow;
  previousWindow: MetricWindow;
};

export type OverviewInput = CycleOverviewInput | RollingOverviewInput;

export type OrgOverviewV1 = {
  range: number;
  cycleView: "current_cycles" | "previous_cycles" | "last_30_days";
  period: { from: string; to: string; previousFrom: string; previousTo: string };
  hasActivity: boolean;
  partialData: boolean;
  observation: {
    rangeDays: number;
    daysWithActivity: number;
    firstActivityDate: string | null;
    partialWindow: boolean;
  };
  kpis: {
    actualSpend: {
      value: number;
      previousValue: number;
      deltaPercent: number | null;
      basis: "subscriptions" | "none";
    };
    verifiedUsageCost: { value: number; previousValue: number; deltaPercent: number | null };
    estimatedApiCost: { value: number; previousValue: number; deltaPercent: number | null };
    tokens: { value: number; previousValue: number; deltaPercent: number | null };
  };
  /** One row per tool line (plans/cycles rolled up). */
  subscriptionCycles: Array<{
    id: string;
    toolName: string;
    toolKey: string | null;
    planNames: string[];
    planCount: number;
    cycleSpend: number;
    verifiedUsageCost: number;
    estimatedApiCost: number;
    modelCalls: number;
    windowFrom: string;
    windowTo: string;
    /** Share of total tool-line spend in this view (0–100). */
    spendSharePercent: number;
    /** Provider quota or included-allowance utilization (0–100+). */
    utilizationPercent: number | null;
    /** Capped utilization for progress bars (0–100). */
    utilizationDisplayPercent: number | null;
    verdictCode: PlanVerdictCode | null;
    /** Soonest renewal among plans under this tool. */
    billingCycle: BillingCycleInfo;
  }>;
  renewals: Array<{
    id: string;
    toolName: string;
    toolKey: string | null;
    planNames: string[];
    planCount: number;
    nextRenewalDate: string;
    remainingDays: number;
    elapsedPercent: number;
  }>;
  trend: Array<{
    date: string;
    previousDate: string;
    requests: number;
    cost: number;
    previousRequests: number;
    previousCost: number;
  }>;
  attention: AttentionItem[];
  tools: Array<{ name: string; requests: number; cost: number; activeDevelopers: number }>;
  coverage: {
    developers: number;
    activeDevelopers: number;
    devices: number;
    configuredTools: number;
    trackedTools: number;
  };
  failures: Array<{
    id: string;
    createdAt: string;
    developer: string;
    tool: string;
    model: string;
    latencyMs: number;
    status: string;
  }>;
};
