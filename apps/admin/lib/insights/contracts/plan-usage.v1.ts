import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type {
  IncludedAllowanceUtilization,
  PlanVerdict,
  QuotaUtilization,
} from "@/lib/billing/plan-utilization-policy";

export type PlanUsageInput = {
  reportWindow: MetricWindow;
  developerId?: string;
};

export type BillingCycleInfo = {
  cycleStart: string;
  cycleEnd: string;
  nextRenewalDate: string;
  elapsedPercent: number;
  remainingDays: number;
  totalDays: number;
};

export type PlanUsageSubscriptionRow = {
  planTemplateId: string;
  toolKey: string | null;
  toolName: string;
  planName: string;
  tier: string | null;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
  billingCadence: string;
  billingCycle: BillingCycleInfo;
  cycleSeatMicros: string;
  includedCycleMicros: string;
  primaryQuota: QuotaUtilization | null;
  quotas: QuotaUtilization[];
  included: IncludedAllowanceUtilization | null;
  primaryRatio: number | null;
  verdict: PlanVerdict;
  billing: {
    grossSeatMicros: string;
    grossUsageMicros: string;
    includedCreditsMicros: string;
    netMicros: string;
  } | null;
};

export type PlanUsageDeveloperPlanRow = {
  assignmentId: string;
  planTemplateId: string;
  toolKey: string | null;
  toolName: string;
  planName: string;
  seatCount: number;
  billingCadence: string;
  billingCycle: BillingCycleInfo;
  cycleSeatMicros: string;
  includedCycleMicros: string;
  primaryQuota: QuotaUtilization | null;
  quotas: QuotaUtilization[];
  included: IncludedAllowanceUtilization | null;
  primaryRatio: number | null;
  verdict: PlanVerdict;
  billing: {
    cycleStart: string;
    cycleEnd: string;
    grossSeatMicros: string;
    grossUsageMicros: string;
    includedCreditsMicros: string;
    netMicros: string;
  } | null;
};

export type PlanUsageDeveloperRow = {
  developerId: string;
  name: string;
  email: string;
  plans: PlanUsageDeveloperPlanRow[];
  primaryRatio: number | null;
  verdict: PlanVerdict;
};

export type PlanUsageSummary = {
  subscriptions: number;
  seatCapacity: number;
  assignedSeats: number;
  availableSeats: number;
  avgUtilizationPercent: number | null;
  nearLimitCount: number;
  lightUseCount: number;
  noSignalCount: number;
};

export type PlanUsageV1 = {
  summary: PlanUsageSummary;
  subscriptions: PlanUsageSubscriptionRow[];
  developers: PlanUsageDeveloperRow[];
};
