import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";
import { findDeviceByBearerToken } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";

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
    const tools = body.tools;
    if (!Array.isArray(tools)) {
      return NextResponse.json({ error: "tools array required" }, { status: 400 });
    }

    let upserted = 0;
    const reportedNames: string[] = [];
    const sample: Array<{ toolName: string; version: string | null; configured: boolean }> = [];
    for (const tool of tools) {
      if (!tool.toolName) continue;
      const detected = tool.detected !== false;
      if (!detected) continue;
      reportedNames.push(tool.toolName);

      await prisma.toolInstallation.upsert({
        where: { deviceId_toolName: { deviceId: device.id, toolName: tool.toolName } },
        update: {
          detected: true,
          configured: tool.configured ?? false,
          configPath: tool.configPath ?? null,
          version: tool.version ?? null,
          lastCheckedAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          toolName: tool.toolName,
          detected: true,
          configured: tool.configured ?? false,
          configPath: tool.configPath ?? null,
          version: tool.version ?? null,
        },
      });
      if (sample.length < 8) {
        sample.push({
          toolName: tool.toolName,
          version: tool.version ?? null,
          configured: Boolean(tool.configured),
        });
      }
      upserted += 1;
    }

    // Drop stale rows for tools no longer present on this device.
    if (reportedNames.length > 0) {
      await prisma.toolInstallation.deleteMany({
        where: {
          deviceId: device.id,
          toolName: { notIn: reportedNames },
        },
      });
    } else {
      await prisma.toolInstallation.deleteMany({ where: { deviceId: device.id } });
    }

    const toolNames = uniqueStrings(reportedNames);
    await recordDeviceActivityEvent({
      orgId: device.orgId,
      developerId: device.userId,
      deviceId: device.id,
      kind: "tools",
      status: "ok",
      summary: `Tools sync · ${upserted} tools${toolNames.length ? ` · ${toolNames.join(", ")}` : ""}`,
      requestSummary: { tools: upserted, names: toolNames, sample },
      responseSummary: { upserted },
      durationMs: Date.now() - started,
    });

    return NextResponse.json({ upserted });
  } catch (e) {
    logServerError("devices/tools", e);
    return NextResponse.json({ error: "tools upsert failed" }, { status: 500 });
  }
}
