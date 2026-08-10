import { NextRequest, NextResponse } from "next/server";
import { resolveUsageIngestContext } from "@/lib/ingest/device-context";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { ingestUsageSyncChunk } from "@/lib/sync/usage-sync";
import type { LocalUsageInputRow } from "@/lib/ingest/local-usage-batch";
import { timingHeader } from "@/lib/api/app-response";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const totalStart = performance.now();
  try {
    const parsedBody = await limitedJson(req, 1024 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;

    const context = await resolveUsageIngestContext(req, body);
    if (context instanceof NextResponse) return context;
    const { orgId, userId, deviceId } = context;

    const syncRunId = typeof body.syncRunId === "string" ? body.syncRunId : "";
    const chunkId = typeof body.chunkId === "string" ? body.chunkId : "";
    if (!syncRunId || !chunkId) {
      return NextResponse.json({ error: "syncRunId and chunkId required" }, { status: 400 });
    }

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
    const totalMs = performance.now() - totalStart;
    const serverTiming = timingHeader({
      upsert: result.timings.upsertMs,
      fingerprints: result.timings.fingerprintsMs,
      total: totalMs,
    });
    console.info("[sync/usage/chunk-timing]", {
      orgId,
      deviceId,
      syncRunId,
      chunkId,
      rowCount: rows.length,
      upsertMs: result.timings.upsertMs,
      fingerprintsMs: result.timings.fingerprintsMs,
      totalMs,
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { "server-timing": serverTiming } });
  } catch (error) {
    logServerError("sync/usage/chunk", error);
    const message = error instanceof Error ? error.message : "sync chunk failed";
    const status = message.includes("not found") ? 404 : message.includes("is ") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
