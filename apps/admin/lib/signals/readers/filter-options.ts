import { prisma } from "@usejunction/db";

export async function readSignalsFilterOptions(orgId: string) {
  const [developers, browserTools, workTools] = await Promise.all([
    prisma.developer.findMany({
      where: { orgId },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, email: true },
    }),
    prisma.signalsSession.findMany({
      where: { orgId },
      distinct: ["aiTool"],
      orderBy: { aiTool: "asc" },
      select: { aiTool: true },
    }),
    prisma.localWorkSession.findMany({
      where: { orgId },
      distinct: ["toolName"],
      orderBy: { toolName: "asc" },
      select: { toolName: true },
    }),
  ]);

  const tools = [...new Set([
    ...browserTools.map((row) => row.aiTool).filter(Boolean),
    ...workTools.map((row) => row.toolName).filter(Boolean),
  ])].sort();

  return {
    developers,
    tools,
  };
}
