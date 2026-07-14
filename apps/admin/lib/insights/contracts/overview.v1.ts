import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import type { AttentionItem } from "@/lib/insights/policies/attention";

export type OverviewInput = {
  reportWindow: MetricWindow;
  range: 7 | 30 | 90;
  previousWindow: MetricWindow;
};

export type OrgOverviewV1 = {
  range: 7 | 30 | 90;
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
    modelCalls: { value: number; previousValue: number; deltaPercent: number | null };
  };
  trend: Array<{
    date: string;
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
    onlineDevices: number;
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
  planUsageSummary: {
    avgUtilizationPercent: number | null;
    nearLimitCount: number;
    lightUseCount: number;
    noSignalCount: number;
    seatCapacity: number;
    assignedSeats: number;
  };
};
