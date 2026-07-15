import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import type { DeveloperOverviewV1 } from "@/lib/insights/contracts/developer-overview.v1";
import { getDeveloperOverview as getDeveloperOverviewInsight } from "@/lib/insights/queries/get-developer-overview";
import type { OrganizationRole } from "@/lib/workspace-context";
import { prisma } from "@usejunction/db";

export type AiCodingMetrics = DeveloperOverviewV1["aiCoding"];
export type ModelUsageRow = DeveloperOverviewV1["modelUsage"][number];

/** Page-compatible shape with legacy field aliases (usage30d, etc.). */
export type MeOverviewData = DeveloperOverviewV1 & {
  usage30d: DeveloperOverviewV1["usage"];
  toolsUsage30d: DeveloperOverviewV1["toolsUsage"];
  aiCoding30d: DeveloperOverviewV1["aiCoding"];
  modelUsage30d: DeveloperOverviewV1["modelUsage"];
};

function toMeShape(data: DeveloperOverviewV1): MeOverviewData {
  return {
    ...data,
    usage30d: data.usage,
    toolsUsage30d: data.toolsUsage,
    aiCoding30d: data.aiCoding,
    modelUsage30d: data.modelUsage,
  };
}

export async function getMeOverview(
  orgId: string,
  userId: string,
  role: OrganizationRole,
): Promise<MeOverviewData> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId: userId },
    select: { id: true },
  });
  if (!developer) throw new Error("developer profile required");

  const envelope = await getDeveloperOverviewInsight(
    {
      orgId,
      actorId: userId,
      roles: [role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    {
      reportWindow: resolveReportWindow({ range: 30 }),
      developerId: developer.id,
      role,
    },
  );
  return toMeShape(envelope.data);
}

/** Admin view of any teammate by developer id. */
export async function getDeveloperOverview(
  orgId: string,
  developerId: string,
): Promise<MeOverviewData | null> {
  try {
    const envelope = await getDeveloperOverviewInsight(
      {
        orgId,
        actorId: "system",
        roles: ["owner"],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      {
        reportWindow: resolveReportWindow({ range: 30 }),
        developerId,
      },
    );
    return toMeShape(envelope.data);
  } catch (error) {
    if (error instanceof Error && error.message === "developer profile required") return null;
    throw error;
  }
}
