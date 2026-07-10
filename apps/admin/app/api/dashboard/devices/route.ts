import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();

    const devices = await prisma.device.findMany({
      where: { orgId },
      orderBy: { lastSeenAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        toolInstallations: { select: { toolName: true, detected: true, configured: true } },
        quotaSnapshots: { select: { toolName: true, usedPercent: true, creditsRemaining: true, windowType: true, updatedAt: true } },
        _count: { select: { requestMetadata: true } },
      },
    });

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    return NextResponse.json({
      devices: devices.map((d) => ({
        id: d.id,
        hostname: d.hostname,
        os: d.os,
        architecture: d.architecture,
        agentVersion: d.agentVersion,
        status: d.lastSeenAt > fiveMinAgo ? "online" : "offline",
        lastSeenAt: d.lastSeenAt,
        createdAt: d.createdAt,
        user: d.user,
        toolInstallations: d.toolInstallations,
        quotaSnapshots: d.quotaSnapshots,
        totalRequests: d._count.requestMetadata,
      })),
    });
  } catch (e) {
    console.error("[dashboard/devices]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
