import { NextRequest, NextResponse } from "next/server";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { ingestUsageSyncChunk } from "@/lib/sync/usage-sync";
import type { LocalUsageInputRow } from "@/lib/ingest/local-usage-batch";
import { prisma } from "@usejunction/db";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const parsedBody = await limitedJson(req, 1024 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;

    let orgId: string | null = null;
    let userId: string | null = null;
    let deviceId: string | null = null;

    const device = await findDeviceByBearerToken(req, {});
    if (device) {
      orgId = device.orgId;
      userId = device.userId;
      deviceId = device.id;
    }
    if (!deviceId) {
      const authResult = requireIngestAuth(req);
      if (authResult instanceof NextResponse) return authResult;
      orgId = typeof body.orgId === "string" ? body.orgId : null;
      userId = typeof body.userId === "string" ? body.userId : null;
      deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
    }
    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const syncRunId = typeof body.syncRunId === "string" ? body.syncRunId : "";
    const chunkId = typeof body.chunkId === "string" ? body.chunkId : "";
    if (!syncRunId || !chunkId) {
      return NextResponse.json({ error: "syncRunId and chunkId required" }, { status: 400 });
    }

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    const rows: LocalUsageInputRow[] = Array.isArray(body.aggregates)
      ? (body.aggregates as LocalUsageInputRow[])
      : Array.isArray(body.rows)
        ? (body.rows as LocalUsageInputRow[])
        : [];
    if (rows.length > 1000) {
      return NextResponse.json({ error: "maximum 1000 aggregates per chunk" }, { status: 413 });
    }

    const result = await ingestUsageSyncChunk({
      orgId,
      userId,
      deviceId,
      syncRunId,
      chunkId,
      contentHash: typeof body.contentHash === "string" ? body.contentHash : undefined,
      rows,
      observedAt: typeof body.observedAt === "string" ? new Date(body.observedAt) : new Date(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logServerError("sync/usage/chunk", error);
    const message = error instanceof Error ? error.message : "sync chunk failed";
    const status = message.includes("not found") ? 404 : message.includes("is ") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
