import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { verifyIngestAuth, getDefaultOrgId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!verifyIngestAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const orgId = body.orgId || getDefaultOrgId();

  const record = await prisma.requestMetadata.create({
    data: {
      orgId,
      userId: body.userId || null,
      deviceId: body.deviceId || null,
      toolName: body.toolName || null,
      provider: body.provider || null,
      model: body.model || null,
      inputTokens: body.inputTokens || 0,
      outputTokens: body.outputTokens || 0,
      totalTokens: body.totalTokens || 0,
      estimatedCost: body.estimatedCost || 0,
      latencyMs: body.latencyMs || 0,
      status: body.status || "success",
      traceId: body.traceId || null,
      source: body.source || "gateway",
    },
  });

  return NextResponse.json({ id: record.id });
}
