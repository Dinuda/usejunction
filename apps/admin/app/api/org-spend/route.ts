import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";

export async function GET() {
  const orgId = getDefaultOrgId();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const gatewayTotal = await prisma.requestMetadata.aggregate({
    where: { orgId, createdAt: { gte: since } },
    _sum: { estimatedCost: true, totalTokens: true },
  });

  const result: Record<string, unknown> = {
    gateway: {
      cost: gatewayTotal._sum.estimatedCost || 0,
      tokens: gatewayTotal._sum.totalTokens || 0,
    },
    adminApis: {},
  };

  const openaiKey = process.env.OPENAI_ADMIN_KEY;
  if (openaiKey) {
    try {
      const res = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(since.getTime() / 1000)}`,
        { headers: { Authorization: `Bearer ${openaiKey}` } }
      );
      if (res.ok) {
        result.adminApis = { ...(result.adminApis as object), openai: await res.json() };
      }
    } catch {
      result.adminApis = { ...(result.adminApis as object), openai: { error: "fetch failed" } };
    }
  }

  return NextResponse.json(result);
}
