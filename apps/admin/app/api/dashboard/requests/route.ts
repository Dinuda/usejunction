import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const orgId = getDefaultOrgId();
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
  const langfuseUrl = process.env.NEXT_PUBLIC_LANGFUSE_URL || "http://localhost:3000";

  const requests = await prisma.requestMetadata.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: true, device: true },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      timestamp: r.createdAt,
      user: r.user?.name || r.userId,
      device: r.device?.hostname || r.deviceId,
      tool: r.toolName,
      model: r.model,
      provider: r.provider,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cost: r.estimatedCost,
      latency: r.latencyMs,
      status: r.status,
      traceLink: r.traceId ? `${langfuseUrl}/trace/${r.traceId}` : null,
    })),
  });
}
