import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { bearerToken, requireIngestAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = bearerToken(req);

    let orgId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;

    if (token) {
      const device = await prisma.device.findUnique({ where: { deviceToken: token } });
      if (device) {
        orgId = device.orgId;
        userId = device.userId;
        deviceId = device.id;
      }
    }

    if (!deviceId) {
      const authResult = requireIngestAuth(req);
      if (authResult instanceof NextResponse) return authResult;
      orgId = body.orgId ?? null;
      userId = body.userId ?? null;
      deviceId = body.deviceId ?? null;
    }

    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const rows: Array<{
      date: string;
      toolName: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      estimatedCost?: number;
      source?: string;
      userId?: string;
      deviceId?: string;
    }> = Array.isArray(body)
      ? body
      : body.aggregates ?? body.rows ?? [body];

    let upserted = 0;
    for (const row of rows) {
      if (!row.date || !row.toolName) continue;

      const date = new Date(row.date);
      const model = row.model ?? "";

      await prisma.localUsageAggregate.upsert({
        where: {
          deviceId_date_toolName_model: {
            deviceId,
            date,
            toolName: row.toolName,
            model,
          },
        },
        update: {
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          cacheReadTokens: row.cacheReadTokens ?? 0,
          estimatedCost: row.estimatedCost ?? 0,
          source: row.source ?? "local_scan",
        },
        create: {
          orgId,
          userId: row.userId ?? userId,
          deviceId: row.deviceId ?? deviceId,
          date,
          toolName: row.toolName,
          model,
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          cacheReadTokens: row.cacheReadTokens ?? 0,
          estimatedCost: row.estimatedCost ?? 0,
          source: row.source ?? "local_scan",
        },
      });
      upserted += 1;
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[ingest/local-usage]", e);
    return NextResponse.json({ error: "local-usage ingest failed" }, { status: 500 });
  }
}
