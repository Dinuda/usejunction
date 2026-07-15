import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";
import { hashOpaqueToken } from "@/lib/security";

export async function POST(req: NextRequest) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const device = await prisma.device.findUnique({ where: { deviceTokenHash: hashOpaqueToken(token) } });
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rows = Array.isArray(body.quotas)
      ? body.quotas
      : Array.isArray(body.snapshots)
        ? body.snapshots
        : [body];

    let upserted = 0;
    for (const snap of rows) {
      if (!snap?.toolName || !snap?.windowType) continue;

      const existing = await prisma.quotaSnapshot.findFirst({
        where: {
          deviceId: device.id,
          toolName: snap.toolName,
          windowType: snap.windowType,
        },
      });

      if (existing) {
        await prisma.quotaSnapshot.update({
          where: { id: existing.id },
          data: {
            usedPercent: snap.usedPercent ?? null,
            resetAt: snap.resetAt ? new Date(snap.resetAt) : null,
            creditsRemaining: snap.creditsRemaining ?? null,
            source: snap.source ?? "cli_rpc",
            updatedAt: new Date(),
          },
        });
      } else {
        await prisma.quotaSnapshot.create({
          data: {
            orgId: device.orgId,
            deviceId: device.id,
            toolName: snap.toolName,
            windowType: snap.windowType,
            usedPercent: snap.usedPercent ?? null,
            resetAt: snap.resetAt ? new Date(snap.resetAt) : null,
            creditsRemaining: snap.creditsRemaining ?? null,
            source: snap.source ?? "cli_rpc",
          },
        });
      }
      upserted += 1;
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/quota]", e);
    return NextResponse.json({ error: "quota upsert failed" }, { status: 500 });
  }
}
