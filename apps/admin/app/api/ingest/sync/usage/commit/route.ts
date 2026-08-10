import { NextRequest, NextResponse, after } from "next/server";
import { resolveUsageIngestContext } from "@/lib/ingest/device-context";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { commitUsageSync, runDeferredUsageCommitWork } from "@/lib/sync/usage-sync";
import { timingHeader } from "@/lib/api/app-response";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const totalStart = performance.now();
  try {
    const parsedBody = await limitedJson(req, 64 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, unknown>;

    const context = await resolveUsageIngestContext(req, body);
    if (context instanceof NextResponse) return context;
    const { orgId, userId, deviceId } = context;

    const syncRunId = typeof body.syncRunId === "string" ? body.syncRunId : "";
    if (!syncRunId) return NextResponse.json({ error: "syncRunId required" }, { status: 400 });

    const result = await commitUsageSync(
      {
        orgId,
        deviceId,
        syncRunId,
        expectedChunks: typeof body.expectedChunks === "number" ? body.expectedChunks : undefined,
        remainingPartitions:
          typeof body.remainingPartitions === "number" ? body.remainingPartitions : undefined,
      },
      { deferHeavyWork: true },
    );
    const { deferredWork, ...payload } = result;
    if (deferredWork) {
      after(async () => {
        try {
          await runDeferredUsageCommitWork(deferredWork);
        } catch (error) {
          logServerError("sync/usage/commit-deferred", error, { orgId, deviceId, syncRunId });
        }
      });
    }

    const totalMs = performance.now() - totalStart;
    const serverTiming = timingHeader({
      materialize: result.timings.materializeMs,
      reconcile: result.timings.reconcileMs,
      total: totalMs,
    });
    console.info("[sync/usage/commit-timing]", {
      orgId,
      deviceId,
      syncRunId,
      materializeMs: result.timings.materializeMs,
      reconcileMs: result.timings.reconcileMs,
      deferred: Boolean(deferredWork),
      dirtyRemaining: result.dirtyRemaining,
      totalMs,
    });
    return NextResponse.json({ ok: true, ...payload }, { headers: { "server-timing": serverTiming } });
  } catch (error) {
    logServerError("sync/usage/commit", error);
    return NextResponse.json({ error: "sync commit failed" }, { status: 500 });
  }
}
