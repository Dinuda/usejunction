import { prisma } from "@usejunction/db";

export interface DashboardRequestRow {
  id: string;
  tool: string | null;
  toolName: string | null;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  status: string;
  traceId: string | null;
  traceLink: string | null;
  source: string;
  createdAt: Date;
  user: { name: string; email: string } | null;
  device: { hostname: string } | null;
}

export interface DashboardRequestsData {
  requests: DashboardRequestRow[];
  nextCursor: string | null;
}

export interface DashboardRequestsOptions {
  limit?: number;
  cursor?: string;
  toolName?: string;
  status?: string;
  from?: Date;
  to?: Date;
}

export async function getDashboardRequests(
  orgId: string,
  options: DashboardRequestsOptions = {}
): Promise<DashboardRequestsData> {
  const limit = Math.min(options.limit ?? 50, 200);
  const { cursor, toolName, status, from, to } = options;

  const where = {
    orgId,
    ...(toolName ? { toolName } : {}),
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
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
  const langfuseBase = (process.env.NEXT_PUBLIC_LANGFUSE_URL || "http://localhost:3000").replace(/\/$/, "");

  return {
    requests: requests.map((r) => ({
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
      traceLink: r.traceId ? `${langfuseBase}/trace/${r.traceId}` : null,
      source: r.source,
      createdAt: r.createdAt,
      user: r.user,
      device: r.device,
    })),
    nextCursor,
  };
}
