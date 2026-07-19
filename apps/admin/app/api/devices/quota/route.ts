import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";
import { findDeviceByBearerToken } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const device = await findDeviceByBearerToken(req, {});
    if (!device) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsedBody = await limitedJson(req, 128 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;
    const rows = Array.isArray(body.quotas)
      ? body.quotas
      : Array.isArray(body.snapshots)
        ? body.snapshots
        : [body];

    let upserted = 0;
    const sample: Array<{
      toolName: string;
      windowType: string;
      usedPercent: number | null;
      creditsRemaining: number | null;
    }> = [];
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
      if (sample.length < 8) {
        sample.push({
          toolName: snap.toolName,
          windowType: snap.windowType,
          usedPercent: snap.usedPercent ?? null,
          creditsRemaining: snap.creditsRemaining ?? null,
        });
      }
      upserted += 1;
    }

    const toolNames = uniqueStrings(sample.map((row) => row.toolName));
    await recordDeviceActivityEvent({
      orgId: device.orgId,
      developerId: device.userId,
      deviceId: device.id,
      kind: "quota",
      status: "ok",
      summary: `Quota sync · ${upserted} snapshots${toolNames.length ? ` · ${toolNames.join(", ")}` : ""}`,
      requestSummary: { quotas: upserted, tools: toolNames, sample },
      responseSummary: { upserted },
      durationMs: Date.now() - started,
    });

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[devices/quota]", e);
    return NextResponse.json({ error: "quota upsert failed" }, { status: 500 });
  }
}
