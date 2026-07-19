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

test("MemberPlanBoard renders vendor percentage, reset, expected marker, and utilization label", () => {
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
  });

  const { container } = render(<MemberPlanBoard cards={cards} />);

  expect(screen.getByText("10%")).toBeInTheDocument();
  expect(screen.getByText("Underutilized")).toBeInTheDocument();
  expect(screen.getByText("resets in 15d")).toBeInTheDocument();
  expect(container.querySelector('span[aria-hidden="true"][style*="left: 50%"]')).not.toBeNull();
});
