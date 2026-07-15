import type { MetricWindow } from "@/lib/analytics/contracts/time-window";

export type ToolDetailInsightInput = {
  reportWindow: MetricWindow;
  toolKey: string;
};

export type ToolDetailInsightV1 = {
  toolKey: string;
  name: string;
  shortName: string;
  provider: string;
  product: string;
  toolName: string;
  aliases: readonly string[];
  sourceUrl: string;
  kpis: {
    devices: number;
    people: number;
    seatsFree: number;
    seatsPurchased: number;
    seatsAssigned: number;
    spend: number;
    requests: number;
    tokens: number;
  };
  people: Array<{
    developerId: string;
    name: string;
    email: string;
    detected: boolean;
    deviceHostname: string | null;
    vendorPlan: string | null;
    vendorEmail: string | null;
    mappedCatalogPlanKey: string | null;
    assignment: {
      id: string;
      planTemplateId: string;
      planName: string;
      catalogPlanKey: string | null;
      source: string;
    } | null;
    planMismatch: boolean;
  }>;
  quotas: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    resetAt: Date | null;
    deviceHostname: string | null;
    developerName: string | null;
  }>;
  plans: Array<{
    id: string;
    toolKey: string | null;
    catalogPlanKey: string | null;
    name: string;
    tier: string | null;
    billingCadence: string;
    seatCapacity: number;
    monthlySeatMicros: bigint;
    estimatedMonthlyMicros: bigint;
    assignedSeats: number;
    availableSeats: number;
    customPrice: boolean;
    priceSource: string;
    active: boolean;
  }>;
};
