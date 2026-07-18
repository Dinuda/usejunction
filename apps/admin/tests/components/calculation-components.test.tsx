// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AiCodingPanel } from "@/components/dashboard/ai-coding-panel";
import { RosterPlanUsage } from "@/components/developers/roster-plan-usage";
import { SignalsFilters } from "@/components/signals/signals-filters";
import { FlowPath, changeLabel, durationLabel } from "@/components/signals/signals-ui";
import { ToolProviderDetail } from "@/components/tools/tool-provider-detail";
import type { AiCodingMetrics, ModelUsageRow } from "@/lib/queries/me/overview";
import "../setup/component";

const router = { push: vi.fn() };

vi.mock("next/navigation", () => ({
  usePathname: () => "/signals/activity",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/tools/tool-brand-icon", () => ({
  ToolLogoTile: ({ tool }: { tool: string }) => <span aria-label={`${tool} logo`} />,
  hasToolBrandIcon: () => true,
  ToolBrandIcon: ({ tool }: { tool: string }) => <span aria-label={`${tool} icon`} />,
}));

const baseMetrics: AiCodingMetrics = {
  suggestedLines: 100,
  acceptedLines: 25,
  addedLines: 30,
  deletedLines: 5,
  commits: 4,
  aiPercent: null,
  inputTokens: 1_000,
  outputTokens: 500,
  cacheReadTokens: 250,
  cacheWriteTokens: 50,
  reasoningTokens: 0,
  cost: 4.25,
  verifiedCost: 1.25,
};

function usageRow(index: number): ModelUsageRow {
  return {
    toolName: "cursor",
    model: `model-${index}`,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
    reasoningTokens: 0,
    cost: 0.1,
    requests: 1,
    suggestedLines: 0,
    acceptedLines: 0,
    source: "gateway_observed",
    verified: false,
    costKind: "estimated_api",
    metricKind: "usage",
  };
}

describe("calculation-bearing components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("AiCodingPanel calculates acceptance, separates productivity, filters, and paginates", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => usageRow(index));
    rows.push({ ...usageRow(99), model: "productivity-row", metricKind: "productivity" });

    render(<AiCodingPanel metrics={baseMetrics} models={rows} />);

    expect(screen.getByText(/100 suggested · 25% accept/)).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument();
    expect(screen.getByText("26 usage models with no truncation")).toBeInTheDocument();
    expect(screen.getByText("Lines and commits — not model calls or billed usage")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–25 of 26")).toBeInTheDocument();
    expect(screen.queryByText("model-25")).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Next" })[0]!);
    expect(screen.getByText("Showing 26–26 of 26")).toBeInTheDocument();
    expect(screen.getByText("model-25")).toBeInTheDocument();

    const search = screen.getAllByPlaceholderText("Search models…")[0]!;
    await userEvent.type(search, "model-25");
    expect(screen.getAllByText("Showing 1–1 of 1")).toHaveLength(2);
  });

  test("AiCodingPanel handles zero suggested lines and zero token breakdown", () => {
    render(
      <AiCodingPanel
        metrics={{ ...baseMetrics, suggestedLines: 0, acceptedLines: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }}
        models={[]}
      />,
    );

    expect(screen.queryByText(/accept$/)).not.toBeInTheDocument();
    expect(screen.getByText("No token breakdown yet.")).toBeInTheDocument();
    expect(screen.getByText("0 usage models with no truncation")).toBeInTheDocument();
  });

  test("RosterPlanUsage averages signaled plans, clamps the visual meter, and chooses the worst verdict", () => {
    render(
      <RosterPlanUsage
        plans={[
          { toolName: "cursor", toolKey: "cursor", planName: "Pro", primaryRatio: 0.5, verdict: { code: "HEALTHY", severity: "info", reasons: [], policyVersion: "plan-utilization-v1" } },
          { toolName: "claude", toolKey: "claude", planName: "Max", primaryRatio: 1.2, verdict: { code: "LIMIT_EXCEEDED", severity: "critical", reasons: [], policyVersion: "plan-utilization-v1" } },
        ]}
      />,
    );

    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "85");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-label", "Average plan use 85 percent, Over limit");
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText(/avg across 2 plans · Over limit/)).toBeInTheDocument();
  });

  test("RosterPlanUsage reports no signal without inventing a percentage", () => {
    render(
      <RosterPlanUsage
        plans={[{ toolName: "cursor", toolKey: "cursor", planName: "Pro", primaryRatio: null, verdict: { code: "UNKNOWN", severity: "info", reasons: [], policyVersion: "plan-utilization-v1" } }]}
      />,
    );

    expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "Plan use waiting for quota signal");
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  test("SignalsFilters debounces URL updates and removes hidden filters", async () => {
    vi.useFakeTimers();
    try {
      render(
        <SignalsFilters
          value={{ teamId: "team-1", tool: "cursor", developerId: "dev-1" }}
          teams={[{ id: "team-1", name: "Platform" }]}
          tools={["cursor", "claude"]}
          developers={[{ id: "dev-1", name: "Alice" }]}
          showPerson
        />,
      );

      fireEvent.change(screen.getByLabelText("AI tool"), { target: { value: "claude" } });
      expect(router.push).not.toHaveBeenCalled();
      vi.advanceTimersByTime(399);
      expect(router.push).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(router.push).toHaveBeenCalledWith("/signals/activity?teamId=team-1&tool=claude&developerId=dev-1");

      fireEvent.change(screen.getByLabelText("Team"), { target: { value: "" } });
      vi.advanceTimersByTime(400);
      expect(router.push).toHaveBeenLastCalledWith("/signals/activity?tool=claude&developerId=dev-1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("Signals formatters and FlowPath preserve edge-case semantics", () => {
    expect(durationLabel(45)).toBe("45s");
    expect(durationLabel(90)).toBe("2m");
    expect(durationLabel(3600)).toBe("1h");
    expect(changeLabel(null)).toBe("—");
    expect(changeLabel(0)).toBe("0%");
    expect(changeLabel(12)).toBe("+12%");
    expect(changeLabel(-8)).toBe("-8%");

    render(<FlowPath flow="github -> cursor -> slack" />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getAllByText("→")).toHaveLength(2);
  });

  test("ToolProviderDetail labels usage cost separately from subscription seats", () => {
    render(
      <ToolProviderDetail
        data={{
          toolKey: "cursor",
          name: "Cursor",
          shortName: "Cursor",
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          aliases: [],
          sourceUrl: "https://example.com",
          kpis: { devices: 0, people: 1, seatsFree: 1, seatsPurchased: 2, seatsAssigned: 1, usageCost: 6, requests: 10, tokens: 1_500_000 },
          people: [],
          quotas: [],
          plans: [],
          toolsUsed: [],
          toolSequences: [],
          modelsByDeveloper: [],
        }}
      />,
    );

    expect(screen.getByText("Usage cost (current)")).toBeInTheDocument();
    expect(screen.getByText("$6.00")).toBeInTheDocument();
    expect(screen.getByText(/10 requests · verified \+ estimated/)).toBeInTheDocument();
    expect(screen.getByLabelText("Subscription view")).toBeInTheDocument();
  });
});
