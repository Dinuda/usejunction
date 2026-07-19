import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolveSignalsWindows } from "../lib/signals/queries/windows";

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  getSignalsOverview: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireOrgRole: mocks.requireOrgRole,
  rolesFor: () => ["owner", "admin"],
}));

vi.mock("@/lib/signals", () => ({
  getSignalsOverview: mocks.getSignalsOverview,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org_1",
    userId: "user_1",
    role: "owner",
  });
  mocks.getSignalsOverview.mockImplementation(async (_context, input) => {
    const windows = resolveSignalsWindows(input, new Date("2026-07-16T12:00:00.000Z"));
    return {
      data: {
        windowDays: windows.windowDays,
        insight: "No journeys yet.",
        kpis: {
          sessions: { value: 0, previousValue: 0, changePercent: null },
          activePeople: { value: 0, previousValue: 0, changePercent: null },
          timeAroundAiSeconds: { value: 0, previousValue: 0, changePercent: null },
          topJourney: { flowKey: null, flow: null, sessions: 0 },
        },
        trend: [],
        topJourneys: [],
        topTools: [],
      },
    };
  });
});

test("Signals summary accepts an arbitrary valid day count", async () => {
  const { GET } = await import("../app/api/signals/summary/route");
  const response = await GET(new NextRequest("http://localhost/api/signals/summary?days=14"));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).windowDays, 14);
  assert.equal(mocks.getSignalsOverview.mock.calls[0][1].days, 14);
});

test("Signals summary rejects the removed range parameter", async () => {
  const { GET } = await import("../app/api/signals/summary/route");
  const response = await GET(new NextRequest("http://localhost/api/signals/summary?range=7"));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /range is no longer supported/i);
  assert.match(body.hint, /days=1\.\.366/);
  assert.equal(mocks.getSignalsOverview.mock.calls.length, 0);
});

test.each(["days=0", "days=7.5", "from=", "from=2026-07-01", "days=7&from=2026-07-01&to=2026-07-07"])(
  "Signals summary rejects invalid window query %s",
  async (query) => {
    const { GET } = await import("../app/api/signals/summary/route");
    const response = await GET(new NextRequest(`http://localhost/api/signals/summary?${query}`));
    assert.equal(response.status, 400);
  },
);
