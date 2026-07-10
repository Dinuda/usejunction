import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const installations = await prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId },
      _count: { id: true },
    });

    const configured = await prisma.toolInstallation.groupBy({
      by: ["toolName"],
      where: { orgId, configured: true },
      _count: { id: true },
    });

    const activity = await prisma.requestMetadata.groupBy({
      by: ["toolName"],
      where: { orgId, createdAt: { gte: since7d }, toolName: { not: null } },
      _count: { id: true },
      _sum: { estimatedCost: true, totalTokens: true },
      orderBy: { _count: { id: "desc" } },
    });

    const configuredMap = new Map(configured.map((c) => [c.toolName, c._count.id]));
    const activityMap = new Map(
      activity.map((a) => [a.toolName, { requests7d: a._count.id, cost7d: a._sum.estimatedCost ?? 0, tokens7d: a._sum.totalTokens ?? 0 }])
    );

    const allToolNames = new Set([
      ...installations.map((i) => i.toolName),
      ...activity.map((a) => a.toolName ?? ""),
    ].filter(Boolean));

    return NextResponse.json({
      tools: Array.from(allToolNames).map((toolName) => {
        const inst = installations.find((i) => i.toolName === toolName);
        return {
          toolName,
          installedOn: inst?._count.id ?? 0,
          configuredOn: configuredMap.get(toolName) ?? 0,
          ...activityMap.get(toolName) ?? { requests7d: 0, cost7d: 0, tokens7d: 0 },
        };
      }).sort((a, b) => b.requests7d - a.requests7d),
    });
  } catch (e) {
    console.error("[dashboard/tools]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
