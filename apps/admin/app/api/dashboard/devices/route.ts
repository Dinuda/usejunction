import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();

  const devices = await prisma.device.findMany({
    where: { orgId },
    include: {
      user: true,
      toolInstallations: true,
      localModels: true,
      localUsageAggregates: { orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      os: d.os,
      architecture: d.architecture,
      agentVersion: d.agentVersion,
      status: d.status,
      lastSeenAt: d.lastSeenAt,
      user: d.user.name,
      tools: d.toolInstallations,
      localModels: d.localModels,
      lastLocalScan: d.localUsageAggregates[0]?.date || null,
    })),
  });
}
