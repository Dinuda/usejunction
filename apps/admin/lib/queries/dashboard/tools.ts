import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getToolActivity } from "@/lib/insights/queries/get-tool-activity";
import type { ToolActivityV1 } from "@/lib/insights/contracts/tool-activity.v1";

export type DashboardToolsData = {
  tools: Array<{
    toolName: string;
    installedOn: number;
    configuredOn: number;
    evidence: Array<{ source: string; developers: number }>;
    requests7d: number;
    cost7d: number;
    tokens7d: number;
    quotas: ToolActivityV1["tools"][number]["quotas"];
  }>;
};

export async function getDashboardTools(orgId: string): Promise<DashboardToolsData> {
  const envelope = await getToolActivity(
    {
      orgId,
      actorId: "system",
      roles: ["owner"],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    { reportWindow: resolveReportWindow({ range: 7 }) },
  );
  return {
    tools: envelope.data.tools.map((tool) => ({
      toolName: tool.toolName,
      installedOn: tool.installedOn,
      configuredOn: tool.configuredOn,
      evidence: tool.evidence,
      requests7d: tool.requests,
      cost7d: tool.cost,
      tokens7d: tool.tokens,
      quotas: tool.quotas,
    })),
  };
}
