import { NextRequest, NextResponse, after } from "next/server";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { logServerError } from "@/lib/errors/public";
import { commitUsageSync, runDeferredUsageCommitWork } from "@/lib/sync/usage-sync";
import { prisma } from "@usejunction/db";
import { timingHeader } from "@/lib/api/app-response";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const totalStart = performance.now();
  try {
    const parsedBody = await limitedJson(req, 64 * 1024);
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
    if (!syncRunId) return NextResponse.json({ error: "syncRunId required" }, { status: 400 });

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

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
