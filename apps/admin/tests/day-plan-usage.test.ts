import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  attachCyclePlanPercentToTools,
  formatPlanToolRunway,
  isPlanPressureStatus,
} from "@/lib/reports/day-plan-usage";
import type { DailyReportPlanTool, DailyReportToolRow } from "@/lib/reports/daily-report";

describe("day plan usage", () => {
  test("attaches dashboard cycle plan % and exhaust date onto today's tool rows", () => {
    const tools: DailyReportToolRow[] = [
      {
        toolName: "cursor",
        displayName: "Cursor",
        requests: 86,
        tokens: 8_000_000,
        cost: 63.4,
        sharePercent: 99,
        tokenSharePercent: 99,
      },
      {
        toolName: "chatgpt",
        displayName: "ChatGPT",
        requests: 2,
        tokens: 46_700,
        cost: 0.154,
        sharePercent: 1,
        tokenSharePercent: 1,
      },
    ];
    const planTools: DailyReportPlanTool[] = [
      {
        toolName: "cursor",
        displayName: "Cursor",
        usedPercent: 32,
        statusLabel: "Near limit",
        withinAllowance: false,
        exhaustDateLabel: "Aug 8",
      },
      {
        toolName: "chatgpt-codex",
        displayName: "ChatGPT",
        usedPercent: 7,
        statusLabel: "Within allowance",
        withinAllowance: true,
        exhaustDateLabel: "Sep 12",
      },
    ];

    const enriched = attachCyclePlanPercentToTools({ tools, planTools });
    assert.equal(enriched[0]!.planUsedPercent, 32);
    assert.equal(enriched[0]!.planStatusLabel, "Near limit");
    assert.equal(enriched[0]!.planExhaustDateLabel, "Aug 8");
    assert.equal(enriched[1]!.planUsedPercent, 7);
    assert.equal(enriched[1]!.planStatusLabel, "Within allowance");
    assert.equal(enriched[1]!.planExhaustDateLabel, "Sep 12");
  });

  test("formatPlanToolRunway always includes exhaust date when present", () => {
    assert.equal(
      formatPlanToolRunway({
        statusLabel: "Within allowance",
        exhaustDateLabel: "Sep 12",
      }),
      "Within allowance · Runs out Sep 12",
    );
    assert.equal(
      formatPlanToolRunway({
        statusLabel: "Near limit",
        exhaustDateLabel: "Aug 8",
      }),
      "Near limit · Runs out Aug 8",
    );
    assert.equal(isPlanPressureStatus("Near limit"), true);
    assert.equal(isPlanPressureStatus("Within allowance"), false);
  });

  test("leaves plan fields null when tool has no quota card", () => {
    const enriched = attachCyclePlanPercentToTools({
      tools: [
        {
          toolName: "unknown-tool",
          displayName: "Unknown",
          requests: 1,
          tokens: 10,
          cost: 0.01,
          sharePercent: 100,
          tokenSharePercent: 100,
        },
      ],
      planTools: [],
    });
    assert.equal(enriched[0]!.planUsedPercent, null);
    assert.equal(enriched[0]!.planStatusLabel, null);
    assert.equal(enriched[0]!.planExhaustDateLabel, null);
  });
});
