import type { OrganizationRole } from "@/lib/workspace-context";
import type { MetricWindow } from "@/lib/analytics/contracts/time-window";
import { serializeMetricWindow } from "@/lib/analytics/contracts/time-window";

export type InsightKind = "overview" | "plan-usage";

export type InsightContext = {
  orgId: string;
  actorId: string;
  roles: OrganizationRole[];
  now: Date;
  timezone: string;
};

export type InsightEnvelope<T> = {
  schemaVersion: "1";
  kind: InsightKind;
  generatedAt: string;
  dataThrough: string | null;
  timezone: string;
  window: { from: string; to: string; grain: "day" };
  data: T;
};

export function assertInsightRoles(
  context: InsightContext,
  allowed: readonly OrganizationRole[],
): void {
  if (!context.roles.some((role) => allowed.includes(role))) {
    throw new Error("FORBIDDEN");
  }
}

export function makeInsightEnvelope<T>(input: {
  context: InsightContext;
  kind: InsightKind;
  window: MetricWindow;
  dataThrough: Date | null;
  data: T;
}): InsightEnvelope<T> {
  return {
    schemaVersion: "1",
    kind: input.kind,
    generatedAt: input.context.now.toISOString(),
    dataThrough: input.dataThrough?.toISOString() ?? null,
    timezone: input.context.timezone,
    window: serializeMetricWindow(input.window),
    data: input.data,
  };
}
