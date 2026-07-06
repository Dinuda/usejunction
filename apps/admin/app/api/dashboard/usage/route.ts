import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const orgId = getDefaultOrgId();
  const source = req.nextUrl.searchParams.get("source") || "combined";
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [requests, localAggs] = await Promise.all([
    source !== "local_scan"
      ? prisma.requestMetadata.findMany({ where: { orgId, createdAt: { gte: since } }, include: { user: true } })
      : Promise.resolve([]),
    source !== "gateway"
      ? prisma.localUsageAggregate.findMany({ where: { orgId, date: { gte: since } }, include: { user: true } })
      : Promise.resolve([]),
  ]);

  const rows: Array<Record<string, unknown>> = [];

  if (source !== "local_scan") {
    for (const r of requests) {
      rows.push({
        source: "gateway",
        date: r.createdAt.toISOString().slice(0, 10),
        user: r.user?.name || r.userId,
        tool: r.toolName,
        model: r.model,
        provider: r.provider,
        tokens: r.totalTokens,
        cost: r.estimatedCost,
        latency: r.latencyMs,
      });
    }
  }

  if (source !== "gateway") {
    for (const a of localAggs) {
      rows.push({
        source: "local_scan",
        date: a.date.toISOString().slice(0, 10),
        user: a.user?.name || a.userId,
        tool: a.toolName,
        model: a.model,
        provider: null,
        tokens: a.inputTokens + a.outputTokens,
        cost: a.estimatedCost,
        latency: null,
      });
    }
  }

  return NextResponse.json({ usage: rows });
}
