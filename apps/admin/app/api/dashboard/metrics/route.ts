import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUsageMetricsStore } from "@/lib/analytics/adapters/prisma-usage-metrics-store";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import type { UsageDimension } from "@/lib/analytics/contracts/usage-metrics";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";
import { serializeBigInts } from "@/lib/billing/validation";
import { inclusiveDayCount, usageWindowDays } from "@/lib/metrics/date-range";
import { requireOrgRole } from "@/lib/rbac";
import { prisma } from "@usejunction/db";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groupBy: z.enum(["day", "developer", "tool", "provider", "repository"]).default("day"),
  source: z.enum(["preferred", "all"]).default("preferred"),
});

const dimensionMap: Record<string, UsageDimension> = {
  day: "time",
  developer: "developer",
  tool: "tool",
  provider: "provider",
};

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });

  const raw = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid metric query", details: parsed.error.flatten() }, { status: 400 });
  }

  const to = parsed.data.to ?? new Date();
  const from = parsed.data.from ?? usageWindowDays(30, to).from;
  if (to < from || inclusiveDayCount(from, to) > 366) {
    return NextResponse.json({ error: "date range must be between 0 and 366 days" }, { status: 400 });
  }

  const window = resolveReportWindow({
    from,
    to,
    timezone: UTC_TIMEZONE,
  });
  const metrics = createUsageMetricsStore();
  const dimension = dimensionMap[parsed.data.groupBy] ?? "time";

  const [data, billingFacts, assignments] = await Promise.all([
    metrics.query({
      orgId: auth.orgId,
      window,
      measures: ["requests", "inputTokens", "outputTokens", "cost"],
      dimensions: [dimension],
    }),
    metrics.billingFacts({ orgId: auth.orgId, window }),
    prisma.developerPlanAssignment.findMany({ where: { orgId: auth.orgId } }),
  ]);

  const billing = calculateBilling({
    assignments,
    usage: billingFacts,
    from: window.from,
    to: window.to,
  }).map(serializeBillingLine);

  return NextResponse.json(
    serializeBigInts({
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: parsed.data.groupBy,
      source: parsed.data.source,
      data,
      billing,
      billingSource: "manual_config_primary",
      metricVersion: "metrics-v1",
    }),
  );
}
