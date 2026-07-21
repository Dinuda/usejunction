import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    appRuntimeSetting: { upsert: mocks.upsert },
  },
}));

vi.mock("@/lib/analytics/query", () => ({
  invalidateAllAnalyticsCaches: mocks.invalidateAll,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mocks.upsert.mockResolvedValue({ key: "fullUsageRescanDay", value: "2026-07-21" });
  mocks.invalidateAll.mockResolvedValue(4);
});

test("usage daily refresh seals the UTC day and invalidates caches", async () => {
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
  assert.equal(mocks.upsert.mock.calls.length, 1);
  assert.equal(mocks.upsert.mock.calls[0][0].where.key, "fullUsageRescanDay");
  assert.equal(mocks.upsert.mock.calls[0][0].create.value, body.day);
  assert.equal(mocks.invalidateAll.mock.calls.length, 1);
});

test("usage daily refresh rejects an invalid secret", async () => {
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
