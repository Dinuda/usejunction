import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { calculateBilling, serializeBillingLine } from "@/lib/billing/calculator";
import { usageDayFilterInclusive, usageInclusiveEnd } from "@/lib/metrics/date-range";
import { requireOrgRole } from "@/lib/rbac";

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = parseDate(req.nextUrl.searchParams.get("from"), monthStart);
  const to = parseDate(req.nextUrl.searchParams.get("to"), usageInclusiveEnd(now));
  const developerId = req.nextUrl.searchParams.get("developerId") || undefined;
  const toolName = req.nextUrl.searchParams.get("tool") || undefined;
  const assignments = await prisma.developerPlanAssignment.findMany({
    where: { orgId: auth.orgId, ...(developerId ? { developerId } : {}), ...(toolName ? { toolName } : {}) },
  });
  const usage = await prisma.usageDaily.findMany({
    where: { orgId: auth.orgId, date: usageDayFilterInclusive(from, to), ...(developerId ? { developerId } : {}), ...(toolName ? { toolName } : {}) },
    select: { date: true, source: true, costMicros: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, observedAt: true, developerId: true, provider: true, product: true, toolName: true },
  });
  const lines = calculateBilling({ assignments, usage, from, to });
  const developerIds = [...new Set(lines.map((line) => line.developerId))];
  const developers = await prisma.developer.findMany({ where: { orgId: auth.orgId, id: { in: developerIds } }, select: { id: true, name: true, email: true } });
  const developerMap = new Map(developers.map((developer) => [developer.id, developer]));
  const reconciliation = new Map<string, bigint>();
  for (const row of usage) reconciliation.set(row.source, (reconciliation.get(row.source) ?? BigInt(0)) + row.costMicros);
  return NextResponse.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    calculationVersion: "manual-v1",
    lines: lines.map((line) => ({ ...serializeBillingLine(line), developer: developerMap.get(line.developerId) ?? null })),
    reconciliation: Object.fromEntries(Array.from(reconciliation.entries()).map(([source, micros]) => [source, micros.toString()])),
  });
}
