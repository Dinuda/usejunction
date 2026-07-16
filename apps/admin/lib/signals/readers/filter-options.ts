import { prisma } from "@usejunction/db";

export async function readSignalsFilterOptions(orgId: string) {
  const [developers, teams, tools] = await Promise.all([
    prisma.developer.findMany({
      where: { orgId },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, email: true, teamId: true },
    }),
    prisma.team.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.signalsSession.findMany({
      where: { orgId },
      distinct: ["aiTool"],
      orderBy: { aiTool: "asc" },
      select: { aiTool: true },
    }),
  ]);
  return {
    developers,
    teams,
    tools: tools.map((row) => row.aiTool),
  };
}
