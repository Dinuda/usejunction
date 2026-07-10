import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireIngestAuth, getDefaultOrgId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authResult = requireIngestAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await req.json();
    const orgId = body.orgId ?? getDefaultOrgId();

    const record = await prisma.requestMetadata.create({
      data: {
        orgId,
        userId: body.userId ?? null,
        deviceId: body.deviceId ?? null,
        toolName: body.toolName ?? null,
        provider: body.provider ?? null,
        model: body.model ?? null,
        inputTokens: body.inputTokens ?? body.tokens?.input ?? 0,
        outputTokens: body.outputTokens ?? body.tokens?.output ?? 0,
        totalTokens: body.totalTokens ?? body.tokens?.total ?? 0,
        estimatedCost: body.estimatedCost ?? body.cost ?? 0,
        latencyMs: body.latencyMs ?? body.latency ?? 0,
        status: body.status ?? "success",
        traceId: body.traceId ?? null,
        source: body.source ?? "gateway",
      },
    });

    return NextResponse.json({ id: record.id });
  } catch (e) {
    console.error("[ingest/request]", e);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
