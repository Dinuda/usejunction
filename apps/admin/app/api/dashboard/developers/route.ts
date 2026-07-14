import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireOrgRole } from "@/lib/rbac";
import { serializeBigInts } from "@/lib/billing/validation";
import { usageWindowDays } from "@/lib/metrics/date-range";
import { syncDetectedPlansForOrg } from "@/lib/tools/sync-detected";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = auth.orgId;
    if (!orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });
    const usage7d = usageWindowDays(7);

    try {
      await syncDetectedPlansForOrg(orgId);
    } catch (syncError) {
      console.error("GET /api/dashboard/developers plan sync failed", syncError);
    }

    const users = await prisma.developer.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        devices: {
          select: {
            id: true,
            hostname: true,
            status: true,
            lastSeenAt: true,
            toolInstallations: { where: { detected: true }, select: { toolName: true, version: true } },
          },
        },
        seatAssignments: {
          select: { provider: true, product: true, plan: true, status: true, source: true, lastActivityAt: true, observedAt: true, connection: { select: { id: true, status: true, lastSyncedAt: true } } },
        },
        toolClaims: {
          where: { enabled: true },
          select: { toolName: true, source: true, observedAt: true },
        },
        planAssignments: {
          where: { active: true },
          select: { id: true, developerId: true, planTemplateId: true, provider: true, product: true, toolName: true, planName: true, planTier: true, currency: true, monthlySeatMicros: true, includedMonthlyMicros: true, inputRateMicrosPerMillion: true, outputRateMicrosPerMillion: true, cacheRateMicrosPerMillion: true, seatCount: true, seatStatus: true, startDate: true, endDate: true, source: true, active: true, vendorAccountEmail: true, template: { select: { toolKey: true, catalogPlanKey: true } } },
          orderBy: { startDate: "desc" },
        },
        _count: { select: { requestMetadata: true } },
      },
    });

    const recentActivity = await prisma.requestMetadata.groupBy({
      by: ["userId"],
      where: { orgId, createdAt: { gte: usage7d.from }, userId: { not: null } },
      _count: { id: true },
      _sum: { estimatedCost: true },
    });

    const activityMap = new Map(
      recentActivity.map((a) => [a.userId, { requests7d: a._count.id, cost7d: a._sum.estimatedCost ?? 0 }])
    );

    return NextResponse.json(serializeBigInts({
      developers: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        teamId: u.teamId,
        createdAt: u.createdAt,
        totalRequests: u._count.requestMetadata,
        devices: u.devices,
        assignedPlans: u.seatAssignments,
        manualPlans: u.planAssignments,
        toolEvidence: u.toolClaims,
        ...activityMap.get(u.id) ?? { requests7d: 0, cost7d: 0 },
      })),
    }));
  } catch (e) {
    console.error("[dashboard/developers]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
