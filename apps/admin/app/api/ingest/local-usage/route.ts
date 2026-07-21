import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";
import { formatCompactNumber } from "@/lib/format";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { invalidateAnalyticsCache } from "@/lib/analytics/query";
import { logServerError } from "@/lib/errors/public";
import {
  ingestLocalUsageBatch,
  type LocalUsageInputRow,
} from "@/lib/ingest/local-usage-batch";

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    // 1000 aggregates ≈ 0.4–0.6MB for dense Codex histories; match work-sessions.
    const parsedBody = await limitedJson(req, 1024 * 1024);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data as Record<string, any>;

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
      orgId = body.orgId ?? null;
      userId = body.userId ?? null;
      deviceId = body.deviceId ?? null;
    }

    if (!orgId || !userId || !deviceId) {
      return NextResponse.json({ error: "device context required" }, { status: 400 });
    }

    const rows: LocalUsageInputRow[] = Array.isArray(body)
      ? body
      : body.aggregates ?? body.rows ?? [body];

    if (rows.length > 1000) return NextResponse.json({ error: "maximum 1000 aggregates per request" }, { status: 413 });

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    const { upserted, totalTokens, totalRequests, sample } = await ingestLocalUsageBatch({
      orgId,
      userId,
      deviceId,
      rows,
    });

    if (upserted > 0) {
      await prisma.device.update({
        where: { id: deviceId },
        data: { lastUsageSyncAt: new Date(), lastSeenAt: new Date() },
      });
      await invalidateAnalyticsCache(orgId);
    }

    const tools = uniqueStrings(sample.map((row) => row.toolName).concat(rows.map((row) => row.toolName)));
    const models = uniqueStrings(sample.map((row) => row.model).concat(rows.map((row) => row.model ?? "")));
    await recordDeviceActivityEvent({
      orgId,
      developerId: userId,
      deviceId,
      kind: "usage",
      status: "ok",
      summary: `Usage sync · ${upserted} rows${tools.length ? ` · ${tools.join(", ")}` : ""}${
        totalTokens > 0 ? ` · ${formatCompactNumber(totalTokens)} tokens` : ""
      }`,
      requestSummary: {
        aggregates: rows.length,
        upserted,
        tools,
        models,
        requests: totalRequests,
        tokens: totalTokens,
        sample,
      },
      responseSummary: { upserted },
      durationMs: Date.now() - started,
    });

    return NextResponse.json({ upserted });
  } catch (e) {
    logServerError("ingest/local-usage", e);
    return NextResponse.json({ error: "local-usage ingest failed" }, { status: 500 });
  }
}
