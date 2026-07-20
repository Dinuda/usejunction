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
    const models = body.models;
    if (!Array.isArray(models)) {
      return NextResponse.json({ error: "models array required" }, { status: 400 });
    }

    let upserted = 0;
    const sample: Array<{ provider: string; modelName: string; running: boolean }> = [];
    for (const m of models) {
      if (!m.provider || !m.modelName) continue;

      await prisma.localModel.upsert({
        where: {
          deviceId_provider_modelName: {
            deviceId: device.id,
            provider: m.provider,
            modelName: m.modelName,
          },
        },
        update: {
          size: m.size ?? null,
          running: m.running ?? false,
          lastSeenAt: new Date(),
        },
        create: {
          orgId: device.orgId,
          userId: device.userId,
          deviceId: device.id,
          provider: m.provider,
          modelName: m.modelName,
          size: m.size ?? null,
          running: m.running ?? false,
        },
      });
      if (sample.length < 8) {
        sample.push({
          provider: m.provider,
          modelName: m.modelName,
          running: Boolean(m.running),
        });
      }
      upserted += 1;
    }

    const providers = uniqueStrings(sample.map((row) => row.provider));
    await recordDeviceActivityEvent({
      orgId: device.orgId,
      developerId: device.userId,
      deviceId: device.id,
      kind: "local_models",
      status: "ok",
      summary: `Local models sync · ${upserted} models${providers.length ? ` · ${providers.join(", ")}` : ""}`,
      requestSummary: { models: upserted, providers, sample },
      responseSummary: { upserted },
      durationMs: Date.now() - started,
    });

    return NextResponse.json({ upserted });
  } catch (e) {
    logServerError("devices/local-models", e);
    return NextResponse.json({ error: "local-models upsert failed" }, { status: 500 });
  }
}
