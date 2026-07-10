import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const { searchParams } = req.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
    const cursor = searchParams.get("cursor") ?? undefined;
    const toolName = searchParams.get("tool") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const where = {
      orgId,
      ...(toolName ? { toolName } : {}),
      ...(status ? { status } : {}),
    };

    const requests = await prisma.requestMetadata.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, email: true } },
        device: { select: { hostname: true } },
      },
    });

    const nextCursor = requests.length === limit ? requests[requests.length - 1].id : null;

    return NextResponse.json({
      requests: requests.map((r) => {
        const langfuseBase = (process.env.NEXT_PUBLIC_LANGFUSE_URL || "http://localhost:3000").replace(/\/$/, "");
        const traceLink = r.traceId ? `${langfuseBase}/trace/${r.traceId}` : null;
        return {
          id: r.id,
          tool: r.toolName,
          toolName: r.toolName,
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          totalTokens: r.totalTokens,
          estimatedCost: r.estimatedCost,
          latencyMs: r.latencyMs,
          status: r.status,
          traceId: r.traceId,
          traceLink,
          source: r.source,
          createdAt: r.createdAt,
          user: r.user,
          device: r.device,
        };
      }),
      nextCursor,
    });
  } catch (e) {
    console.error("[dashboard/requests]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
