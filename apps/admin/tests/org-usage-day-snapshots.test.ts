import { test } from "vitest";
import assert from "node:assert/strict";
import { prisma } from "@usejunction/db";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  markOrgUsageDaysDirty,
  materializeOrgUsageDay,
  materializeOrgUsageRange,
  readOrgUsageFromSnapshots,
} from "@/lib/analytics/snapshots";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";

const runDb = Boolean(process.env.DATABASE_URL);

test("org day snapshots materialize and sum without rescanning history", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Snap Org ${suffix}`, slug: `snap-${suffix}` },
  });
  const day = new Date("2026-07-10T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `snap-${suffix}@example.com`,
      name: "Snap Dev",
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
        requests: 10,
        inputTokens: BigInt(1000),
        outputTokens: BigInt(200),
        costMicros: BigInt(1_500_000),
        costKind: "estimated_api",
        dedupeKey: `snap-test:${suffix}:cursor`,
        observedAt: new Date("2026-07-10T12:00:00.000Z"),
      },
    });

    await markOrgUsageDaysDirty(org.id, [day]);
    const written = await materializeOrgUsageDay(org.id, day);
    assert.ok(written >= 1);

    const snapshot = await prisma.orgUsageDaySnapshot.findFirst({
      where: { orgId: org.id, date: day, toolName: "", metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.ok(snapshot);
    assert.equal(snapshot.requests, 10);
    assert.equal(Number(snapshot.estimatedApiCostMicros), 1_500_000);

    const dirty = await prisma.analyticsDirtyDay.count({
      where: { orgId: org.id, date: day, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(dirty, 0);

    const overview = await readOrgUsageFromSnapshots(
      org.id,
      { from: day, to: day, timezone: UTC_TIMEZONE, grain: "day" },
      { includeTools: true },
    );
    assert.equal(overview.kpis.modelCalls, 10);
    assert.equal(overview.kpis.estimatedApiCost, 1.5);
    assert.equal(overview.tools.length, 1);
    assert.equal(overview.tools[0]?.toolName, "cursor");
    assert.equal(overview.activeDevelopers, 1);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("range materialize seals 30 days in one pass under 3s", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Range Org ${suffix}`, slug: `range-${suffix}` },
  });
  const from = new Date("2026-06-01T00:00:00.000Z");
  const to = new Date("2026-06-30T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `range-${suffix}@example.com`,
      name: "Range Dev",
      role: "user",
    },
  });

  try {
    for (let i = 0; i < 30; i += 1) {
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
          requests: 2,
          inputTokens: BigInt(50),
          outputTokens: BigInt(10),
          costMicros: BigInt(50_000),
          costKind: "estimated_api",
          dedupeKey: `range-test:${suffix}:${i}`,
          observedAt: date,
        },
      });
    }

    const started = Date.now();
    await materializeOrgUsageRange(org.id, from, to);
    const durationMs = Date.now() - started;
    assert.ok(durationMs < 3000, `range materialize took ${durationMs}ms`);

    const totals = await prisma.orgUsageDaySnapshot.count({
      where: { orgId: org.id, toolName: "", metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    assert.equal(totals, 30);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
