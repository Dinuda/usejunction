import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  ensureOrgUsageDaySnapshots,
  markOrgUsageDaysDirty,
  materializeDirtyOrgUsageDays,
  materializeOrgUsageRange,
} from "@/lib/analytics/snapshots";
import { invalidateAnalyticsCache } from "@/lib/analytics/query/invalidation";

const runDb = Boolean(process.env.DATABASE_URL);

test("ensure stubs missing days without rematerializing sealed days", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Stub Org ${suffix}`, slug: `stub-${suffix}` },
  });
  const earlyFrom = new Date("2026-05-01T00:00:00.000Z");
  const midFrom = new Date("2026-06-10T00:00:00.000Z");
  const midTo = new Date("2026-06-12T00:00:00.000Z");
  const lateTo = new Date("2026-06-20T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `stub-${suffix}@example.com`,
      name: "Stub Dev",
      role: "user",
    },
  });

  try {
    for (let i = 0; i < 3; i += 1) {
      const date = new Date(midFrom.getTime() + i * 86_400_000);
      await prisma.usageDaily.create({
        data: {
          orgId: org.id,
          developerId: developer.id,
          date,
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          model: "gpt-4.1",
          source: "device_observed",
          requests: 7,
          inputTokens: BigInt(100),
          outputTokens: BigInt(20),
          costMicros: BigInt(100_000),
          costKind: "estimated_api",
          dedupeKey: `stub-test:${suffix}:${i}`,
          observedAt: date,
        },
      });
    }

    await materializeOrgUsageRange(org.id, midFrom, midTo);
    const sealedBefore = await prisma.orgUsageDaySnapshot.findFirst({
      where: {
        orgId: org.id,
        date: midFrom,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.ok(sealedBefore);
    assert.equal(sealedBefore.requests, 7);
    const computedAtBefore = sealedBefore.computedAt.getTime();

    // Leave dirty markers that would have triggered min→max rebuilds before the fix.
    await markOrgUsageDaysDirty(org.id, [earlyFrom, lateTo]);

    const result = await ensureOrgUsageDaySnapshots(org.id, earlyFrom, lateTo);
    assert.ok(result.stubbed > 0);
    assert.equal(result.hadCoverage, true);
    assert.equal(result.recovered, 0);

    const sealedAfter = await prisma.orgUsageDaySnapshot.findFirst({
      where: {
        orgId: org.id,
        date: midFrom,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.ok(sealedAfter);
    assert.equal(sealedAfter.requests, 7);
    assert.equal(sealedAfter.computedAt.getTime(), computedAtBefore);

    const earlyStub = await prisma.orgUsageDaySnapshot.findFirst({
      where: {
        orgId: org.id,
        date: earlyFrom,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.ok(earlyStub);
    assert.equal(earlyStub.requests, 0);

    // Dirty rows must remain for cron / Sync now — ensure does not rematerialize
    // sealed days when stubs do not conflict with usage_daily.
    const dirty = await prisma.analyticsDirtyDay.count({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(dirty, 2);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("ensure does not rematerialize today based on snapshot age", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Today Org ${suffix}`, slug: `today-${suffix}` },
  });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const staleComputedAt = new Date(Date.now() - 10 * 60_000);

  try {
    await prisma.orgUsageDaySnapshot.create({
      data: {
        orgId: org.id,
        date: today,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        requests: 42,
        inputTokens: BigInt(0),
        outputTokens: BigInt(0),
        verifiedUsageCostMicros: BigInt(0),
        estimatedApiCostMicros: BigInt(0),
        actualSpendCostMicros: BigInt(0),
        activeDevelopers: 0,
        activeDeveloperIds: [],
        computedAt: staleComputedAt,
        sourceObservedThrough: null,
      },
    });

    const result = await ensureOrgUsageDaySnapshots(org.id, today, today);
    assert.equal(result.stubbed, 0);
    assert.equal(result.hadCoverage, true);
    assert.equal(result.recovered, 0);

    const row = await prisma.orgUsageDaySnapshot.findFirst({
      where: {
        orgId: org.id,
        date: today,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.ok(row);
    assert.equal(row.requests, 42);
    assert.equal(row.computedAt.getTime(), staleComputedAt.getTime());
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("materializeDirtyOrgUsageDays rematerializes contiguous ranges only", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Dirty Org ${suffix}`, slug: `dirty-${suffix}` },
  });
  const day1 = new Date("2026-06-01T00:00:00.000Z");
  const day2 = new Date("2026-06-02T00:00:00.000Z");
  const day3 = new Date("2026-06-03T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `dirty-${suffix}@example.com`,
      name: "Dirty Dev",
      role: "user",
    },
  });

  try {
    for (const [i, date] of [day1, day2, day3].entries()) {
      await prisma.usageDaily.create({
        data: {
          orgId: org.id,
          developerId: developer.id,
          date,
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          model: "gpt-4.1",
          source: "device_observed",
          requests: i === 1 ? 99 : 5,
          inputTokens: BigInt(10),
          outputTokens: BigInt(2),
          costMicros: BigInt(10_000),
          costKind: "estimated_api",
          dedupeKey: `dirty-test:${suffix}:${i}`,
          observedAt: date,
        },
      });
    }

    // Seed all three days, then leave day2 as a stale stub while only day1+day3 are dirty.
    await materializeOrgUsageRange(org.id, day1, day3);
    await prisma.orgUsageDaySnapshot.updateMany({
      where: {
        orgId: org.id,
        date: day2,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
      data: {
        requests: 1,
        computedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await prisma.analyticsDirtyDay.deleteMany({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    await markOrgUsageDaysDirty(org.id, [day1, day3]);

    const result = await materializeDirtyOrgUsageDays(org.id);
    assert.equal(result.days, 2);

    const rows = await prisma.orgUsageDaySnapshot.findMany({
      where: {
        orgId: org.id,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
        date: { in: [day1, day2, day3] },
      },
      orderBy: { date: "asc" },
    });
    assert.equal(rows[0]?.requests, 5);
    // Gap day stays stale — contiguous rematerialize must not collapse day1→day3 into one range.
    assert.equal(rows[1]?.requests, 1);
    assert.equal(rows[2]?.requests, 5);

    const remainingDirty = await prisma.analyticsDirtyDay.count({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(remainingDirty, 0);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("invalidateAnalyticsCache defaults to dirty-only without rematerialize", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Inv Default ${suffix}`, slug: `invd-${suffix}` },
  });
  const day = new Date("2026-07-15T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `invd-${suffix}@example.com`,
      name: "Inv Dev",
      role: "user",
    },
  });

  try {
    await prisma.usageDaily.create({
      data: {
        orgId: org.id,
        developerId: developer.id,
        date: day,
        provider: "cursor",
        product: "cursor",
        toolName: "cursor",
        model: "gpt-4.1",
        source: "device_observed",
        requests: 11,
        inputTokens: BigInt(50),
        outputTokens: BigInt(10),
        costMicros: BigInt(50_000),
        costKind: "estimated_api",
        dedupeKey: `invd-test:${suffix}`,
        observedAt: day,
      },
    });

    await invalidateAnalyticsCache(org.id, { dirtyDates: [day] });

    const dirty = await prisma.analyticsDirtyDay.count({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(dirty, 1);

    const snaps = await prisma.orgUsageDaySnapshot.count({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(snaps, 0);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("ensure recovers when snapshots were wiped but usage_daily remains", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Wipe Org ${suffix}`, slug: `wipe-${suffix}` },
  });
  const from = new Date("2026-07-01T00:00:00.000Z");
  const to = new Date("2026-07-05T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `wipe-${suffix}@example.com`,
      name: "Wipe Dev",
      role: "user",
    },
  });

  try {
    for (let i = 0; i < 5; i += 1) {
      const date = new Date(from.getTime() + i * 86_400_000);
      await prisma.usageDaily.create({
        data: {
          orgId: org.id,
          developerId: developer.id,
          date,
          provider: "cursor",
          product: "cursor",
          toolName: "cursor",
          model: "gpt-4.1",
          source: "device_observed",
          requests: 4,
          inputTokens: BigInt(80),
          outputTokens: BigInt(20),
          costMicros: BigInt(80_000),
          costKind: "estimated_api",
          dedupeKey: `wipe-test:${suffix}:${i}`,
          observedAt: date,
        },
      });
    }

    await materializeOrgUsageRange(org.id, from, to);
    await prisma.orgUsageDaySnapshot.deleteMany({ where: { orgId: org.id } });

    const result = await ensureOrgUsageDaySnapshots(org.id, from, to);
    assert.ok(result.recovered > 0, "expected fail-safe rematerialize after wipe");

    const total = await prisma.orgUsageDaySnapshot.findFirst({
      where: {
        orgId: org.id,
        date: from,
        toolName: "",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.ok(total);
    assert.equal(total.requests, 4);

    // Second ensure stays warm — no further recovery.
    const again = await ensureOrgUsageDaySnapshots(org.id, from, to);
    assert.equal(again.recovered, 0);
    assert.equal(again.stubbed, 0);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
