import { loadEnvConfig } from "@next/env";
import path from "node:path";
loadEnvConfig(path.join(__dirname, "../.."));
import { prisma } from "@usejunction/db";

async function main() {
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      createdAt: true,
      _count: {
        select: {
          developers: true,
          devices: true,
          usageDaily: true,
          billingPlanTemplates: true,
          signalsSessions: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(JSON.stringify({ orgs }, null, 2));

  for (const org of orgs) {
    const [minMax, byTool, bySource] = await Promise.all([
      prisma.usageDaily.aggregate({
        where: { orgId: org.id },
        _min: { date: true },
        _max: { date: true },
        _sum: { requests: true, costMicros: true, inputTokens: true, outputTokens: true },
      }),
      prisma.usageDaily.groupBy({
        by: ["toolName"],
        where: { orgId: org.id },
        _sum: { requests: true, costMicros: true },
        _count: true,
      }),
      prisma.usageDaily.groupBy({
        by: ["source", "costKind"],
        where: { orgId: org.id },
        _sum: { requests: true, costMicros: true },
        _count: true,
      }),
    ]);
    console.log(
      JSON.stringify(
        {
          org: org.slug,
          range: { min: minMax._min.date, max: minMax._max.date },
          sums: {
            requests: minMax._sum.requests,
            cost: Number(minMax._sum.costMicros ?? BigInt(0)) / 1e6,
            tokens: Number((minMax._sum.inputTokens ?? BigInt(0)) + (minMax._sum.outputTokens ?? BigInt(0))),
          },
          byTool: byTool.map((r) => ({
            tool: r.toolName,
            rows: r._count,
            requests: r._sum.requests,
            cost: Number(r._sum.costMicros ?? BigInt(0)) / 1e6,
          })),
          bySource: bySource.map((r) => ({
            source: r.source,
            costKind: r.costKind,
            rows: r._count,
            requests: r._sum.requests,
            cost: Number(r._sum.costMicros ?? BigInt(0)) / 1e6,
          })),
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
