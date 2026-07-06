import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";
import { fetchProviderIncidents, pollLiteLLMBudget } from "@/lib/providers-status";

export async function GET() {
  const orgId = getDefaultOrgId();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [requests, devices, tools, incidents, litellmBudget] = await Promise.all([
    prisma.requestMetadata.findMany({
      where: { orgId, createdAt: { gte: since } },
    }),
    prisma.device.findMany({ where: { orgId }, include: { user: true } }),
    prisma.toolInstallation.findMany({ where: { orgId } }),
    fetchProviderIncidents(),
    pollLiteLLMBudget(),
  ]);

  const totalRequests = requests.length;
  const totalTokens = requests.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = requests.reduce((s, r) => s + r.estimatedCost, 0);
  const avgLatency =
    totalRequests > 0 ? requests.reduce((s, r) => s + r.latencyMs, 0) / totalRequests : 0;
  const errorRate =
    totalRequests > 0 ? requests.filter((r) => r.status !== "success").length / totalRequests : 0;

  const activeDevs = new Set(requests.map((r) => r.userId).filter(Boolean)).size;
  const activeTools = new Set(requests.map((r) => r.toolName).filter(Boolean)).size;

  const byModel = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byTool = new Map<string, number>();

  for (const r of requests) {
    if (r.model) byModel.set(r.model, (byModel.get(r.model) || 0) + r.totalTokens);
    if (r.userId) byUser.set(r.userId, (byUser.get(r.userId) || 0) + r.estimatedCost);
    if (r.toolName) byTool.set(r.toolName, (byTool.get(r.toolName) || 0) + r.totalTokens);
  }

  const top = (m: Map<string, number>, n = 5) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, value]) => ({ name, value }));

  const users = await prisma.user.findMany({ where: { orgId } });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return NextResponse.json({
    totalRequests,
    totalTokens,
    totalCost,
    avgLatency: Math.round(avgLatency),
    errorRate,
    activeDevelopers: activeDevs || devices.filter((d) => d.status === "online").length,
    activeTools: activeTools || new Set(tools.map((t) => t.toolName)).size,
    topModels: top(byModel),
    topUsers: top(byUser).map((t) => ({ name: userMap[t.name] || t.name, value: t.value })),
    topTools: top(byTool),
    deviceCount: devices.length,
    onlineDevices: devices.filter((d) => d.status === "online").length,
    providerIncidents: incidents,
    litellmBudget,
  });
}
