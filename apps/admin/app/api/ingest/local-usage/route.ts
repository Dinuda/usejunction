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
      repository?: { host?: string; owner?: string; name?: string };
    }> = Array.isArray(body)
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
      const repositoryInput = row.repository;
      const repository = repositoryInput?.host && repositoryInput.owner && repositoryInput.name
        ? await prisma.repository.upsert({
            where: { orgId_host_owner_name: { orgId, host: repositoryInput.host.toLowerCase().slice(0, 255), owner: repositoryInput.owner.slice(0, 255), name: repositoryInput.name.slice(0, 255) } },
            update: {},
            create: { orgId, host: repositoryInput.host.toLowerCase().slice(0, 255), owner: repositoryInput.owner.slice(0, 255), name: repositoryInput.name.slice(0, 255) },
          })
        : null;

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
          userId,
          deviceId,
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

      const dedupeKey = `device:${deviceId}:${date.toISOString().slice(0, 10)}:${row.toolName}:${model}:${repository?.id ?? ""}`;
      await prisma.usageDaily.upsert({
        where: { orgId_dedupeKey: { orgId, dedupeKey } },
        update: {
          repositoryId: repository?.id ?? null,
          inputTokens: BigInt(Math.max(0, Math.round(row.inputTokens ?? 0))),
          outputTokens: BigInt(Math.max(0, Math.round(row.outputTokens ?? 0))),
          cacheReadTokens: BigInt(Math.max(0, Math.round(row.cacheReadTokens ?? 0))),
          costMicros: BigInt(Math.max(0, Math.round((row.estimatedCost ?? 0) * 1_000_000))),
          observedAt: new Date(),
        },
        create: {
          orgId,
          developerId: userId,
          deviceId,
          repositoryId: repository?.id ?? null,
          date,
          provider: row.toolName === "claude" ? "anthropic" : row.toolName === "codex" ? "openai" : row.toolName,
          product: row.toolName,
          toolName: row.toolName,
          model,
          source: "device_observed",
          sourceRef: dedupeKey,
          verified: false,
          inputTokens: BigInt(Math.max(0, Math.round(row.inputTokens ?? 0))),
          outputTokens: BigInt(Math.max(0, Math.round(row.outputTokens ?? 0))),
          cacheReadTokens: BigInt(Math.max(0, Math.round(row.cacheReadTokens ?? 0))),
          costMicros: BigInt(Math.max(0, Math.round((row.estimatedCost ?? 0) * 1_000_000))),
          dedupeKey,
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
