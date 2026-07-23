import { test } from "vitest";
import assert from "node:assert/strict";
import { prisma } from "@usejunction/db";
import { invalidateAnalyticsCache } from "@/lib/analytics/query/invalidation";
import { ORG_DAY_SNAPSHOT_VERSION } from "@/lib/analytics/snapshots";

const runDb = Boolean(process.env.DATABASE_URL);

test("selective invalidation marks dirty days and keeps historical cache rows", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Inv Org ${suffix}`, slug: `inv-${suffix}` },
  });

  try {
    const historicalKey = `hist-${suffix}`;
    const activeKey = `active-${suffix}`;
    const now = new Date();
    await prisma.analyticsQueryCache.createMany({
      data: [
        {
          key: historicalKey,
          orgId: org.id,
          scopeHash: "scope",
          contractVersion: "usage-query-v1",
          calculationVersion: "usage-v2",
          normalizedQuery: { window: { from: "2026-01-01", to: "2026-01-31" } },
          result: { rows: [] },
          generatedAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
        {
          key: activeKey,
          orgId: org.id,
          scopeHash: "scope",
          contractVersion: "usage-query-v1",
          calculationVersion: "usage-v2",
          normalizedQuery: { window: { from: "2026-07-01", to: "2026-07-21" } },
          result: { rows: [] },
          generatedAt: now,
          expiresAt: new Date(now.getTime() + 300_000),
        },
      ],
    });

    const result = await invalidateAnalyticsCache(org.id, {
      dirtyDates: ["2026-07-20"],
    });

    const remaining = await prisma.analyticsQueryCache.findMany({
      where: { orgId: org.id },
      select: { key: true },
    });
    const keys = remaining.map((row) => row.key).sort();
    assert.deepEqual(keys, [historicalKey]);

    // Small dirty sets rematerialize inline; dirty markers are cleared after.
    assert.equal(result.rematerialized, true);
    const dirty = await prisma.analyticsDirtyDay.findMany({
      where: { orgId: org.id, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
      select: { date: true },
    });
    assert.equal(dirty.length, 0);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
