import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";
import { formatCompactNumber } from "@/lib/format";
import { findDeviceByBearerToken, requireIngestAuth } from "@/lib/auth";
import { limitedJson } from "@/lib/security/http";
import { CALCULATION_VERSION } from "@/lib/metrics/source-priority";
import { shouldPreserveProductivityRequests } from "@/lib/metrics/local-usage-inventory";
import { invalidateAnalyticsCache } from "@/lib/analytics/query";
import { logServerError } from "@/lib/errors/public";

type UsageRow = {
  date: string;
  toolName: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  estimatedCost?: number;
  suggestedLines?: number;
  acceptedLines?: number;
  addedLines?: number;
  deletedLines?: number;
  commits?: number;
  aiPercent?: number | null;
  requests?: number;
  source?: string;
  verified?: boolean;
  metricKind?: string;
  costKind?: string;
  calculationVersion?: string;
  userId?: string;
  deviceId?: string;
  repository?: { host?: string; owner?: string; name?: string };
  metadata?: Record<string, unknown>;
};

function providerForTool(toolName: string): string {
  if (toolName === "claude") return "anthropic";
  if (toolName === "codex" || toolName === "codex-work") return "openai";
  if (toolName === "copilot") return "github";
  return toolName;
}

function normalizeCanonicalSource(source: string): string {
  if (source === "local_scan" || source === "cursor_local") return "device_observed";
  if (source === "cursor_usage_events") return "vendor_verified";
  return source;
}

function inferMetricKind(row: UsageRow, source: string): string {
  if (row.metricKind) return row.metricKind;
  if (source === "cursor_local") return "productivity";
  if ((row.suggestedLines ?? 0) + (row.acceptedLines ?? 0) + (row.addedLines ?? 0) + (row.commits ?? 0) > 0 &&
      (row.inputTokens ?? 0) + (row.outputTokens ?? 0) === 0) {
    return "productivity";
  }
  return "usage";
}

function inferCostKind(row: UsageRow, source: string, estimatedCost: number): string | null {
  if (row.costKind) return row.costKind;
  if (estimatedCost <= 0) return null;
  if (row.verified || source === "cursor_usage_events" || normalizeCanonicalSource(source) === "vendor_verified") {
    return "verified_usage";
  }
  return "estimated_api";
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const parsedBody = await limitedJson(req, 128 * 1024);
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

    const rows: UsageRow[] = Array.isArray(body)
      ? body
      : body.aggregates ?? body.rows ?? [body];

    if (rows.length > 1000) return NextResponse.json({ error: "maximum 1000 aggregates per request" }, { status: 413 });

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    let upserted = 0;
    let totalTokens = 0;
    let totalRequests = 0;
    const sample: Array<{
      date: string;
      toolName: string;
      model: string;
      requests: number;
      tokens: number;
    }> = [];
    for (const row of rows) {
      if (!row.date || !row.toolName) continue;

      const date = new Date(row.date);
      if (Number.isNaN(date.getTime())) continue;
      const model = row.model ?? "";
      const rawSource = row.source ?? "local_scan";
      const metricKind = inferMetricKind(row, rawSource);
      const repositoryInput = row.repository;
      const repository = repositoryInput?.host && repositoryInput.owner && repositoryInput.name
        ? await prisma.repository.upsert({
            where: { orgId_host_owner_name: { orgId, host: repositoryInput.host.toLowerCase().slice(0, 255), owner: repositoryInput.owner.slice(0, 255), name: repositoryInput.name.slice(0, 255) } },
            update: {},
            create: { orgId, host: repositoryInput.host.toLowerCase().slice(0, 255), owner: repositoryInput.owner.slice(0, 255), name: repositoryInput.name.slice(0, 255) },
          })
        : null;

      const inputTokens = Math.max(0, Math.round(row.inputTokens ?? 0));
      const outputTokens = Math.max(0, Math.round(row.outputTokens ?? 0));
      const cacheReadTokens = Math.max(0, Math.round(row.cacheReadTokens ?? 0));
      const cacheWriteTokens = Math.max(0, Math.round(row.cacheWriteTokens ?? 0));
      const reasoningTokens = Math.max(0, Math.round(row.reasoningTokens ?? 0));
      const suggestedLines = Math.max(0, Math.round(row.suggestedLines ?? 0));
      const acceptedLines = Math.max(0, Math.round(row.acceptedLines ?? 0));
      const addedLines = Math.max(0, Math.round(row.addedLines ?? 0));
      const deletedLines = Math.max(0, Math.round(row.deletedLines ?? 0));
      const commits = Math.max(0, Math.round(row.commits ?? 0));
      const estimatedCost = row.estimatedCost ?? 0;
      if (estimatedCost < 0) continue;
      const aiPercent = typeof row.aiPercent === "number" ? row.aiPercent : null;
      const source = rawSource;
      const canonicalSource = normalizeCanonicalSource(source);
      const verified = Boolean(row.verified) || canonicalSource === "vendor_verified";
      const costKind = inferCostKind(row, source, estimatedCost);
      const calculationVersion = row.calculationVersion ?? CALCULATION_VERSION;
      const modelName = model;
      const requests =
        metricKind === "productivity" && !shouldPreserveProductivityRequests(metricKind, modelName)
          ? 0
          : Math.max(0, Number(row.requests ?? 0));

      const metadata: Prisma.InputJsonValue = {
        cacheWriteTokens,
        reasoningTokens,
        aiPercent,
        originalSource: source,
        ...(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : {}),
      };

      await prisma.localUsageAggregate.upsert({
        where: {
          deviceId_date_toolName_model_source: {
            deviceId,
            date,
            toolName: row.toolName,
            model,
            source,
          },
        },
        update: {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          reasoningTokens,
          suggestedLines,
          acceptedLines,
          addedLines,
          deletedLines,
          commits,
          aiPercent,
          requests,
          estimatedCost,
          source,
          verified,
          metricKind,
          costKind,
          calculationVersion,
          metadata,
        },
        create: {
          orgId,
          userId,
          deviceId,
          date,
          toolName: row.toolName,
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          reasoningTokens,
          suggestedLines,
          acceptedLines,
          addedLines,
          deletedLines,
          commits,
          aiPercent,
          requests,
          estimatedCost,
          source,
          verified,
          metricKind,
          costKind,
          calculationVersion,
          metadata,
        },
      });

      const dedupeKey = `device:${deviceId}:${date.toISOString().slice(0, 10)}:${row.toolName}:${model}:${source}:${repository?.id ?? ""}`;
      await prisma.usageDaily.upsert({
        where: { orgId_dedupeKey: { orgId, dedupeKey } },
        update: {
          repositoryId: repository?.id ?? null,
          requests,
          inputTokens: BigInt(inputTokens),
          outputTokens: BigInt(outputTokens),
          cacheReadTokens: BigInt(cacheReadTokens),
          cacheWriteTokens: BigInt(cacheWriteTokens),
          reasoningTokens: BigInt(reasoningTokens),
          suggestedLines: BigInt(suggestedLines),
          acceptedLines: BigInt(acceptedLines),
          addedLines: BigInt(addedLines),
          deletedLines: BigInt(deletedLines),
          commits,
          costMicros: BigInt(Math.max(0, Math.round(estimatedCost * 1_000_000))),
          verified,
          source: canonicalSource,
          metricKind,
          costKind,
          calculationVersion,
          metadata,
          observedAt: new Date(),
        },
        create: {
          orgId,
          developerId: userId,
          deviceId,
          repositoryId: repository?.id ?? null,
          date,
          provider: providerForTool(row.toolName),
          product: row.toolName,
          toolName: row.toolName,
          model,
          source: canonicalSource,
          sourceRef: dedupeKey,
          verified,
          requests,
          inputTokens: BigInt(inputTokens),
          outputTokens: BigInt(outputTokens),
          cacheReadTokens: BigInt(cacheReadTokens),
          cacheWriteTokens: BigInt(cacheWriteTokens),
          reasoningTokens: BigInt(reasoningTokens),
          suggestedLines: BigInt(suggestedLines),
          acceptedLines: BigInt(acceptedLines),
          addedLines: BigInt(addedLines),
          deletedLines: BigInt(deletedLines),
          commits,
          costMicros: BigInt(Math.max(0, Math.round(estimatedCost * 1_000_000))),
          metricKind,
          costKind,
          calculationVersion,
          dedupeKey,
          metadata,
        },
      });
      if (sample.length < 8) {
        sample.push({
          date: date.toISOString().slice(0, 10),
          toolName: row.toolName,
          model: model || "unknown",
          requests,
          tokens: inputTokens + outputTokens,
        });
      }
      totalTokens += inputTokens + outputTokens;
      totalRequests += requests;
      upserted += 1;
    }

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
