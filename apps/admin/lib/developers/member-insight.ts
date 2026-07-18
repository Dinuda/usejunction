import { verdictLabel, type PlanVerdictCode } from "@/lib/quotas/plan-utilization-policy";

function workLabel(title: string | null, tldr: string | null) {
  const raw = (title || tldr || "Untitled session").trim();
  return raw.replace(/^\*\*([\s\S]+)\*\*$/, "$1").replace(/\*\*/g, "");
}

export function buildMemberInsight(input: {
  name: string;
  onlineMachines: number;
  totalMachines: number;
  topTool: string | null;
  requests: number;
  planVerdict: PlanVerdictCode | null;
  planAvgPercent: number | null;
  latestWorkTitle: string | null;
  latestWorkTldr: string | null;
  workExtractionEnabled: boolean;
}): string {
  const first = input.name.split(/\s+/)[0] || input.name;

  if (input.totalMachines === 0) {
    return `${first} has no machines enrolled yet. Connect a device to see tools, plan use, and work traces.`;
  }

  if (input.onlineMachines === 0 && input.totalMachines > 0) {
    return `${first}'s ${input.totalMachines === 1 ? "machine is" : "machines are"} offline. Coverage gaps usually mean the agent stopped reporting — check enrollment before reading spend.`;
  }

  if (input.planVerdict === "LIMIT_EXCEEDED" || input.planVerdict === "NEAR_LIMIT") {
    const pct =
      input.planAvgPercent != null
        ? ` (${input.planAvgPercent.toFixed(0)}% · ${verdictLabel(input.planVerdict)})`
        : "";
    return `${first}'s plans are ${verdictLabel(input.planVerdict).toLowerCase()}${pct}. Worth a quick seat or quota check before the next cycle.`;
  }

  if (input.workExtractionEnabled && (input.latestWorkTitle || input.latestWorkTldr)) {
    const work = workLabel(input.latestWorkTitle, input.latestWorkTldr);
    const tool = input.topTool ? ` on ${input.topTool}` : "";
    return `Most recently, ${first} worked on “${work}”${tool}. Use Work for the full trace — no prompts or chat bodies.`;
  }

  if (input.topTool && input.requests > 0) {
    const plan =
      input.planAvgPercent != null && input.planVerdict
        ? ` Plan use is ${input.planAvgPercent.toFixed(0)}% · ${verdictLabel(input.planVerdict).toLowerCase()}.`
        : "";
    return `${first}'s traffic is led by ${input.topTool} this period.${plan}`;
  }

  if (input.requests <= 0) {
    return `${first} is enrolled but quiet in this window. Machines are reporting — waiting on usage or work extraction.`;
  }

  return `${first} has ${input.onlineMachines}/${input.totalMachines} machines online. Open Plans and Work for seat health and what AI is being used for.`;
}
