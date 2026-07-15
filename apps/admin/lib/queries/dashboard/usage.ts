import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getUsageDetail } from "@/lib/insights/queries/get-usage-detail";
import type { UsageDetailV1 } from "@/lib/insights/contracts/usage-detail.v1";

export type DashboardUsageData = UsageDetailV1;

export async function getDashboardUsage(orgId: string, days = 30): Promise<DashboardUsageData> {
  const cappedDays = Math.min(days, 90) as 7 | 30 | 90;
  const range = cappedDays === 7 || cappedDays === 90 ? cappedDays : 30;
  const envelope = await getUsageDetail(
    {
      orgId,
      actorId: "system",
      roles: ["owner"],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    { reportWindow: resolveReportWindow({ range }) },
  );
  return envelope.data;
}
