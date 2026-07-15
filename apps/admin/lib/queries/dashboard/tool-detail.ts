import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getToolDetailInsight } from "@/lib/insights/queries/get-tool-detail";
import type { ToolDetailInsightV1 } from "@/lib/insights/contracts/tool-detail.v1";

export type ToolDetailData = Omit<ToolDetailInsightV1, "kpis"> & {
  kpis: {
    devices: number;
    people: number;
    seatsFree: number;
    seatsPurchased: number;
    seatsAssigned: number;
    spend7d: number;
    requests7d: number;
    tokens7d: number;
  };
};

export async function getToolDetail(orgId: string, toolKey: string): Promise<ToolDetailData | null> {
  const envelope = await getToolDetailInsight(
    {
      orgId,
      actorId: "system",
      roles: ["owner"],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    { reportWindow: resolveReportWindow({ range: 7 }), toolKey },
  );
  if (!envelope) return null;
  const { kpis, ...rest } = envelope.data;
  return {
    ...rest,
    kpis: {
      devices: kpis.devices,
      people: kpis.people,
      seatsFree: kpis.seatsFree,
      seatsPurchased: kpis.seatsPurchased,
      seatsAssigned: kpis.seatsAssigned,
      spend7d: kpis.spend,
      requests7d: kpis.requests,
      tokens7d: kpis.tokens,
    },
  };
}
