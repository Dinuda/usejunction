import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAppPrincipal: vi.fn(),
  resolveLinkedDeveloperId: vi.fn(),
  getWorkActivity: vi.fn(),
  getWorkOverview: vi.fn(),
  readSignalsFilterOptions: vi.fn(),
  listSubscriptions: vi.fn(),
  getOrgSignalsPolicy: vi.fn(),
}));

vi.mock("@/lib/api/app-auth", () => ({
  requireAppPrincipal: mocks.requireAppPrincipal,
}));

vi.mock("@/lib/queries/me/resolve-developer", () => ({
  resolveLinkedDeveloperId: mocks.resolveLinkedDeveloperId,
}));

vi.mock("@/lib/signals", () => ({
  getWorkActivity: mocks.getWorkActivity,
  getWorkOverview: mocks.getWorkOverview,
  readSignalsFilterOptions: mocks.readSignalsFilterOptions,
}));

vi.mock("@/lib/tools/subscriptions", () => ({
  listSubscriptions: mocks.listSubscriptions,
}));

vi.mock("@/lib/signals/service", () => ({
  getOrgSignalsPolicy: mocks.getOrgSignalsPolicy,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppPrincipal.mockResolvedValue({
    orgId: "org-1",
    userId: "user-owner",
    role: "owner",
  });
  mocks.listSubscriptions.mockResolvedValue([]);
  mocks.readSignalsFilterOptions.mockResolvedValue({ teams: [], tools: [], developers: [] });
  mocks.getOrgSignalsPolicy.mockResolvedValue({ workExtractionEnabled: true });
  mocks.getWorkActivity.mockResolvedValue({ data: { enabled: true, sessions: [] } });
  mocks.getWorkOverview.mockResolvedValue({
    data: {
      enabled: true,
      sessions: 0,
      activePeople: 0,
      models: 0,
      trend: [],
      topTools: [],
      recent: [],
    },
  });
});

describe("signals activity audience scope", () => {
  test("scope=you forces the linked developer id and ignores query developerId", async () => {
    mocks.resolveLinkedDeveloperId.mockResolvedValue("linked-dev");
    vi.resetModules();
    const { GET } = await import("@/app/api/app/signals/activity/route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/app/signals/activity?scope=you&developerId=other-dev&teamId=team-1",
      ),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.scope, "you");
    assert.equal(body.data.developerId, "linked-dev");
    assert.equal(body.data.teamId, undefined);
    assert.equal(mocks.getWorkActivity.mock.calls.length, 1);
    const input = mocks.getWorkActivity.mock.calls[0][1];
    assert.equal(input.developerId, "linked-dev");
    assert.equal(input.teamId, undefined);
  });

  test("scope=team keeps optional developer and team filters", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/app/signals/activity/route");
    const response = await GET(
      new NextRequest(
        "http://localhost/api/app/signals/activity?scope=team&developerId=dev-2&teamId=team-9",
      ),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.scope, "team");
    assert.equal(body.data.developerId, "dev-2");
    assert.equal(body.data.teamId, "team-9");
    assert.equal(mocks.resolveLinkedDeveloperId.mock.calls.length, 0);
    const input = mocks.getWorkActivity.mock.calls[0][1];
    assert.equal(input.developerId, "dev-2");
    assert.equal(input.teamId, "team-9");
  });

  test("scope=you with no linked developer returns youUnlinked without querying work", async () => {
    mocks.resolveLinkedDeveloperId.mockResolvedValue(null);
    vi.resetModules();
    const { GET } = await import("@/app/api/app/signals/activity/route");
    const response = await GET(
      new NextRequest("http://localhost/api/app/signals/activity?scope=you"),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.youUnlinked, true);
    assert.equal(body.data.work.enabled, false);
    assert.equal(mocks.getWorkActivity.mock.calls.length, 0);
  });
});

describe("signals overview audience scope", () => {
  test("scope=you passes linked developer into overview", async () => {
    mocks.resolveLinkedDeveloperId.mockResolvedValue("linked-dev");
    vi.resetModules();
    const { GET } = await import("@/app/api/app/signals/overview/route");
    const response = await GET(
      new NextRequest("http://localhost/api/app/signals/overview?scope=you"),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.scope, "you");
    assert.equal(mocks.getWorkOverview.mock.calls[0][1].developerId, "linked-dev");
  });
});
