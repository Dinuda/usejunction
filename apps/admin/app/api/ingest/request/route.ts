import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireIngestAuth, getDefaultOrgId } from "@/lib/auth";
import { invalidateAnalyticsCache } from "@/lib/analytics/query";
import { estimateCost } from "@/lib/metrics/estimate-cost";

function canonicalProvider(value: unknown, model: unknown) {
  const raw = String(value ?? "").toLowerCase();
  const modelName = String(model ?? "").toLowerCase();
  if (raw.includes("anthropic") || raw === "claude" || modelName.includes("claude")) return "anthropic";
  if (raw.includes("openai") || /^(gpt|o\d)/.test(modelName)) return "openai";
  return raw || "unknown";
}

export async function POST(req: NextRequest) {
  const authResult = requireIngestAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await req.json();
    const provider = canonicalProvider(body.provider, body.model);
    const inputTokens = Math.max(0, Math.round(body.inputTokens ?? body.tokens?.input ?? 0));
    const outputTokens = Math.max(0, Math.round(body.outputTokens ?? body.tokens?.output ?? 0));
    const suppliedCost = Number(body.estimatedCost ?? body.cost ?? 0);
    const estimatedCost = suppliedCost > 0
      ? suppliedCost
      : estimateCost(String(body.model ?? ""), inputTokens, outputTokens, 0, 0, provider);
    const orgId = body.orgId ?? getDefaultOrgId();
    const organization = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!organization) return NextResponse.json({ error: "invalid organization" }, { status: 403 });
    if (body.userId) {
      const user = await prisma.developer.findFirst({ where: { id: body.userId, orgId }, select: { id: true } });
      if (!user) return NextResponse.json({ error: "invalid user context" }, { status: 403 });
    }
    if (body.deviceId) {
      const device = await prisma.device.findFirst({ where: { id: body.deviceId, orgId, ...(body.userId ? { userId: body.userId } : {}) }, select: { id: true } });
      if (!device) return NextResponse.json({ error: "invalid device context" }, { status: 403 });
    }

    const record = await prisma.requestMetadata.create({
      data: {
        orgId,
        userId: body.userId ?? null,
        deviceId: body.deviceId ?? null,
        toolName: body.toolName ?? null,
        provider,
        model: body.model ?? null,
        inputTokens,
        outputTokens,
        totalTokens: body.totalTokens ?? body.tokens?.total ?? 0,
        estimatedCost,
        latencyMs: body.latencyMs ?? body.latency ?? 0,
        status: body.status ?? "success",
        traceId: body.traceId ?? null,
        source: body.source ?? "gateway",
      },
    });

    const createdAt = body.createdAt ? new Date(body.createdAt) : record.createdAt;
    const metricDate = Number.isNaN(createdAt.getTime()) ? record.createdAt : createdAt;
    metricDate.setUTCHours(0, 0, 0, 0);
    await prisma.usageDaily.create({
      data: {
        orgId,
        developerId: body.userId ?? null,
        deviceId: body.deviceId ?? null,
        date: metricDate,
        provider: provider.slice(0, 64),
        product: "gateway",
        toolName: String(body.toolName ?? "").slice(0, 64),
        model: String(body.model ?? "").slice(0, 128),
        source: "gateway_observed",
        sourceRef: record.traceId ?? record.id,
        verified: false,
        requests: 1,
        inputTokens: BigInt(inputTokens),
        outputTokens: BigInt(outputTokens),
        costMicros: BigInt(Math.max(0, Math.round(estimatedCost * 1_000_000))),
        costKind: "estimated_api",
        dedupeKey: `gateway:${record.id}`,
        observedAt: record.createdAt,
      },
    });
    await invalidateAnalyticsCache(orgId);

    return NextResponse.json({ id: record.id });
  } catch (e) {
    console.error("[ingest/request]", e);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
