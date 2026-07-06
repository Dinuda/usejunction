import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [installations, requests, localAggs] = await Promise.all([
    prisma.toolInstallation.findMany({ where: { orgId } }),
    prisma.requestMetadata.findMany({ where: { orgId, createdAt: { gte: since } } }),
    prisma.localUsageAggregate.findMany({ where: { orgId, date: { gte: since } } }),
  ]);

  const toolNames = [...new Set(installations.map((t) => t.toolName))];
  const tools = toolNames.map((toolName) => {
    const inst = installations.filter((t) => t.toolName === toolName);
    const reqs = requests.filter((r) => r.toolName === toolName);
    const local = localAggs.filter((a) => a.toolName === toolName);

    const models = new Map<string, number>();
    for (const r of reqs) {
      if (r.model) models.set(r.model, (models.get(r.model) || 0) + r.totalTokens);
    }

    const latency =
      reqs.length > 0 ? reqs.reduce((s, r) => s + r.latencyMs, 0) / reqs.length : 0;

    return {
      toolName,
      usersConfigured: inst.filter((t) => t.configured).length,
      usersDetected: inst.filter((t) => t.detected).length,
      activeUsers: new Set(reqs.map((r) => r.userId).filter(Boolean)).size,
      requests: reqs.length,
      cost: reqs.reduce((s, r) => s + r.estimatedCost, 0),
      localScanCost: local.reduce((s, a) => s + a.estimatedCost, 0),
      avgLatency: Math.round(latency),
      errors: reqs.filter((r) => r.status !== "success").length,
      topModels: [...models.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, tokens]) => ({ name, tokens })),
    };
  });

  return NextResponse.json({ tools });
}
