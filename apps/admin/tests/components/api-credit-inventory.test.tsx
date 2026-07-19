// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/components/tools/tool-brand-icon", () => ({
  ToolLogoTile: ({ tool }: { tool: string }) => <span data-testid="tool-logo">{tool}</span>,
}));

import { ApiCreditInventory } from "@/components/tools/api-credit-inventory";
import "../setup/component";

const pool = {
  id: "pool-1",
  connectionId: "connection-1",
  provider: "openai",
  product: "api_platform",
  name: "OpenAI API credits",
  mode: "recurring",
  currency: "USD",
  budgetMicros: "100000000",
  billingCadence: "monthly",
  billingCycleAnchorDate: "2026-07-01",
  billingCycleDays: null,
  grantStartDate: null,
  expiresAt: null,
  period: { start: "2026-07-01", end: "2026-08-01" },
  verifiedSpentMicros: "25000000",
  pendingEstimatedMicros: "5000000",
  projectedSpentMicros: "30000000",
  verifiedRemainingMicros: "75000000",
  projectedRemainingMicros: "70000000",
  rawRatio: 0.3,
  displayRatio: 0.3,
  projectedExhaustionAt: null,
  spendDays: 2,
  connection: {
    status: "active",
    lastSyncedAt: "2026-07-19T00:00:00.000Z",
    lastCostSyncedAt: "2026-07-18T00:00:00.000Z",
    costDataThrough: "2026-07-18T00:00:00.000Z",
    costAccessAvailable: true,
    degraded: false,
  },
};

afterEach(() => vi.unstubAllGlobals());

test("renders verified spend and pending gateway estimates separately", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "/api/tools/api-credit-pools") return { ok: true, json: async () => ({ pools: [pool] }) };
    if (url === "/api/integrations") return { ok: true, json: async () => ({ connections: [{ id: "connection-1", provider: "openai", product: "api_platform", status: "active" }] }) };
    if (url.includes("/api/tools/api-credit-pools/pool-1/usage")) return { ok: true, json: async () => ({ verifiedAvailable: true, rows: [], keys: [], developers: [] }) };
    throw new Error(`Unexpected URL: ${url}`);
  }));

  render(<ApiCreditInventory />);

  await waitFor(() => expect(screen.getByRole("heading", { name: "OpenAI API credits" })).toBeTruthy());
  expect(screen.getByText("Configured credits")).toBeTruthy();
  expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("$25.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("$5.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("$70.00").length).toBeGreaterThan(0);
  expect(screen.getByText(/not the provider wallet balance/i)).toBeTruthy();
  expect(screen.getByText("No API usage in this period.")).toBeTruthy();
});
