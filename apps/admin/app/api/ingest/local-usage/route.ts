import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { bearerToken, requireIngestAuth } from "@/lib/auth";
import { CALCULATION_VERSION } from "@/lib/metrics/source-priority";
import { invalidateAnalyticsCache } from "@/lib/analytics/query";

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
};

function providerForTool(toolName: string): string {
  if (toolName === "claude") return "anthropic";
  if (toolName === "codex") return "openai";
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

    const rows: UsageRow[] = Array.isArray(body)
      ? body
      : body.aggregates ?? body.rows ?? [body];

    if (rows.length > 1000) return NextResponse.json({ error: "maximum 1000 aggregates per request" }, { status: 413 });

    const contextDevice = await prisma.device.findFirst({ where: { id: deviceId, orgId, userId } });
    if (!contextDevice) return NextResponse.json({ error: "invalid device context" }, { status: 403 });

    let upserted = 0;
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
      const requests = metricKind === "productivity"
        ? 0
        : Math.max(0, Number(row.requests ?? 0));

      const metadata: Prisma.InputJsonValue = {
        cacheWriteTokens,
        reasoningTokens,
        aiPercent,
        originalSource: source,
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
      upserted += 1;
    }

    if (upserted > 0) {
      await prisma.device.update({
        where: { id: deviceId },
        data: { lastUsageSyncAt: new Date(), lastSeenAt: new Date(), status: "online" },
      });
      await invalidateAnalyticsCache(orgId);
    }

    return NextResponse.json({ upserted });
  } catch (e) {
    console.error("[ingest/local-usage]", e);
    return NextResponse.json({ error: "local-usage ingest failed" }, { status: 500 });
  }
}
