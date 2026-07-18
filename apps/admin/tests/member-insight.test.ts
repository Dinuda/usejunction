import { describe, expect, it } from "vitest";
import { buildMemberInsight } from "@/lib/developers/member-insight";

describe("buildMemberInsight", () => {
  it("flags offline machines first", () => {
    const text = buildMemberInsight({
      name: "Dinuda Yaggahavita",
      onlineMachines: 0,
      totalMachines: 1,
      topTool: "Cursor",
      requests: 100,
      planVerdict: "HEALTHY",
      planAvgPercent: 20,
      latestWorkTitle: null,
      latestWorkTldr: null,
      workExtractionEnabled: true,
    });
    expect(text).toMatch(/offline/i);
  });

  it("surfaces recent work when extraction is on", () => {
    const text = buildMemberInsight({
      name: "Dinuda Yaggahavita",
      onlineMachines: 1,
      totalMachines: 1,
      topTool: "Cursor",
      requests: 100,
      planVerdict: "LIGHT_USE",
      planAvgPercent: 4,
      latestWorkTitle: "Member page redesign",
      latestWorkTldr: "Hub tabs for work and plans",
      workExtractionEnabled: true,
    });
    expect(text).toMatch(/Member page redesign/);
    expect(text).toMatch(/Cursor/);
  });

  it("warns on near-limit plans", () => {
    const text = buildMemberInsight({
      name: "Alex",
      onlineMachines: 1,
      totalMachines: 1,
      topTool: "ChatGPT",
      requests: 50,
      planVerdict: "NEAR_LIMIT",
      planAvgPercent: 88,
      latestWorkTitle: "Something",
      latestWorkTldr: null,
      workExtractionEnabled: true,
    });
    expect(text).toMatch(/running out|Running out/i);
  });
});
