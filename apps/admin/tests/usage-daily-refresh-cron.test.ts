import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  invalidateAll: vi.fn(),
  markActive: vi.fn(),
  dirtyFindMany: vi.fn(),
  enqueue: vi.fn(),
  drain: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    appRuntimeSetting: { upsert: mocks.upsert },
    analyticsDirtyDay: { findMany: mocks.dirtyFindMany },
  },
}));

vi.mock("@/lib/analytics/query", () => ({
  purgeAllExpiredAnalyticsCaches: mocks.invalidateAll,
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  ORG_DAY_SNAPSHOT_VERSION: "org-day-snap-v1:test",
  markActiveOrgsTodayDirty: mocks.markActive,
}));

vi.mock("@/lib/analytics/snapshots/jobs", () => ({
  enqueueMaterializationJob: mocks.enqueue,
  drainMaterializationJobs: mocks.drain,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mocks.upsert.mockResolvedValue({ key: "fullUsageRescanDay", value: "2026-07-21" });
  mocks.invalidateAll.mockResolvedValue(4);
  mocks.markActive.mockResolvedValue(2);
  mocks.dirtyFindMany.mockResolvedValue([{ orgId: "org-1" }]);
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.drain.mockResolvedValue({ processed: 1, dirtyCleared: 2, remainingJobs: 0 });
});

test("usage daily refresh seals the UTC day, enqueues jobs, drains, and invalidates caches", async () => {
  const { POST } = await import("@/app/api/cron/usage-daily-refresh/route");
  const response = await POST(
    new Request("http://localhost/api/cron/usage-daily-refresh", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    }) as never,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.day, "string");
  assert.match(body.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(body.cachesInvalidated, 4);
  assert.equal(body.orgsMarked, 2);
  assert.equal(body.jobsProcessed, 1);
  assert.equal(body.dirtyCleared, 2);
  assert.equal(mocks.upsert.mock.calls.length, 1);
  assert.equal(mocks.markActive.mock.calls.length, 1);
  assert.equal(mocks.enqueue.mock.calls.length, 1);
  assert.equal(mocks.drain.mock.calls.length, 1);
  assert.equal(mocks.invalidateAll.mock.calls.length, 1);
});

test("usage daily refresh rejects an invalid secret", async () => {
  vi.resetModules();
  const { POST } = await import("@/app/api/cron/usage-daily-refresh/route");
  const response = await POST(
    new Request("http://localhost/api/cron/usage-daily-refresh", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }) as never,
  );

  assert.equal(response.status, 401);
  assert.equal(mocks.upsert.mock.calls.length, 0);
  assert.equal(mocks.invalidateAll.mock.calls.length, 0);
});
