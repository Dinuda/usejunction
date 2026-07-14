import { prisma } from "@usejunction/db";

export async function readAssignments(
  orgId: string,
  options: { developerId?: string } = {},
) {
  return prisma.developerPlanAssignment.findMany({
    where: {
      orgId,
      active: true,
      ...(options.developerId ? { developerId: options.developerId } : {}),
    },
    include: {
      developer: { select: { id: true, name: true, email: true } },
      template: { select: { id: true, toolKey: true, catalogPlanKey: true, name: true } },
    },
    orderBy: [{ developerId: "asc" }, { startDate: "desc" }],
  });
}
