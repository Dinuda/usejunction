import assert from "node:assert/strict";
import { beforeEach, describe, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

describe("applyUserTimeZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("skips auto update when manual lock is set", async () => {
    mocks.findUnique.mockResolvedValue({
      timeZone: "UTC",
      timeZoneManual: true,
    });
    const { applyUserTimeZone } = await import("@/lib/notifications/preferences");
    const result = await applyUserTimeZone({
      userId: "u1",
      timeZone: "Asia/Colombo",
      source: "browser",
    });
    assert.equal(result.updated, false);
    assert.equal(result.skippedManual, true);
    assert.equal(mocks.update.mock.calls.length, 0);
  });

  test("manual source updates and locks", async () => {
    mocks.findUnique.mockResolvedValue({
      timeZone: "UTC",
      timeZoneManual: false,
    });
    mocks.update.mockResolvedValue({});
    const { applyUserTimeZone } = await import("@/lib/notifications/preferences");
    const result = await applyUserTimeZone({
      userId: "u1",
      timeZone: "Asia/Colombo",
      source: "manual",
      forceManual: true,
    });
    assert.equal(result.updated, true);
    assert.equal(mocks.update.mock.calls[0][0].data.timeZoneManual, true);
    assert.equal(mocks.update.mock.calls[0][0].data.timeZone, "Asia/Colombo");
  });
});
