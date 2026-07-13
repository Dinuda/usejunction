import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgRole } from "@/lib/rbac";
import { aggregateMetrics } from "@/lib/metrics/aggregate";
import { prisma } from "@usejunction/db";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groupBy: z.enum(["day", "developer", "tool", "provider", "repository"]).default("day"),
  source: z.enum(["preferred", "all"]).default("preferred"),
});

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });
  const raw = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid metric query", details: parsed.error.flatten() }, { status: 400 });
  const to = parsed.data.to ?? new Date();
  const from = parsed.data.from ?? new Date(to.getTime() - 30 * 86400_000);
  if (to < from || to.getTime() - from.getTime() > 366 * 86400_000) return NextResponse.json({ error: "date range must be between 0 and 366 days" }, { status: 400 });
  const data = await aggregateMetrics({ orgId: auth.orgId, from, to, groupBy: parsed.data.groupBy, includeAllSources: parsed.data.source === "all" });
  const [assignments, usage] = await Promise.all([
    prisma.developerPlanAssignment.findMany({ where: { orgId: auth.orgId } }),
    prisma.usageDaily.findMany({ where: { orgId: auth.orgId, date: { gte: from, lte: to } }, select: { date: true, source: true, costMicros: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, observedAt: true, developerId: true, provider: true, product: true, toolName: true } }),
  ]);
  const billing = calculateBilling({ assignments, usage, from, to }).map(serializeBillingLine);
  return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), groupBy: parsed.data.groupBy, source: parsed.data.source, data, billing, billingSource: "manual_config_primary" });
}
