// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemberPlanBoard } from "@/components/developers/member-plan-board";
import { buildMemberPlanBoard } from "@/lib/quotas/plan-board";
import "../setup/component";

vi.mock("@/components/tools/tool-brand-icon", () => ({
  ToolLogoTile: ({ tool }: { tool: string }) => <span aria-label={`${tool} logo`} />,
}));

vi.mock("@/components/developers/member-work-session-list", () => ({
  MemberWorkSessionList: () => <div>Recent work</div>,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("MemberPlanBoard renders vendor percentage, billing cycle, expected marker, and utilization label", () => {
  const now = new Date();
  const cards = buildMemberPlanBoard({
    now,
    snapshots: [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    toolsUsage: [
      {
        toolName: "cursor",
        requests: 12,
        tokens: 1000,
        cost: 42.5,
        verifiedUsageCost: 0,
        estimatedApiCost: 42.5,
      },
    ],
  });

  const { container } = render(<MemberPlanBoard cards={cards} />);

  expect(screen.getByText("10%")).toBeInTheDocument();
  expect(screen.getByText("Underutilized")).toBeInTheDocument();
  expect(screen.getAllByText("Jul 1 – Aug 1").length).toBeGreaterThan(0);
  expect(screen.getByText(/Monthly · Jul 1 – Aug 1/)).toBeInTheDocument();
  expect(screen.getByText("Accounted")).toBeInTheDocument();
  expect(screen.getByText("$0.00")).toBeInTheDocument();
  expect(screen.getByText("Estimated")).toBeInTheDocument();
  expect(screen.getByText("$42.50")).toBeInTheDocument();
  expect(screen.queryByText(/resets in/i)).toBeNull();
  expect(cards[0]?.quotaSyncedAt).toBeTruthy();
  expect(cards[0]?.billingCycle?.cycleStart).toBe("2026-07-01");
  expect(cards[0]?.billingCycle?.cycleEnd).toBe("2026-08-01");
  expect(container.querySelector('span[aria-hidden="true"][style*="left: 50%"]')).not.toBeNull();
});
