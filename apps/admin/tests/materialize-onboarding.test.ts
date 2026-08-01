import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import {
  ORG_DAY_SNAPSHOT_VERSION,
  claimMaterializationJob,
  enqueueMaterializationJob,
  planMaterializeChunks,
  getWorkspaceSyncReadiness,
  markOrgUsageDaysDirty,
} from "@/lib/analytics/snapshots";

const runDb = Boolean(process.env.DATABASE_URL);

test("planMaterializeChunks is newest-first with escalating widths", () => {
  const from = new Date("2026-06-01T00:00:00.000Z");
  const to = new Date("2026-06-20T00:00:00.000Z");
  const chunks = planMaterializeChunks(from, to);
  assert.ok(chunks.length >= 4);
  // First chunk seals today (= to) alone.
  assert.equal(chunks[0]!.to.toISOString().slice(0, 10), "2026-06-20");
  assert.equal(chunks[0]!.from.toISOString().slice(0, 10), "2026-06-20");
  // Second chunk is 2 days.
  assert.equal(chunks[1]!.to.toISOString().slice(0, 10), "2026-06-19");
  assert.equal(chunks[1]!.from.toISOString().slice(0, 10), "2026-06-18");
  // Coverage is contiguous and complete.
  const covered = new Set<string>();
  for (const chunk of chunks) {
    for (let t = chunk.from.getTime(); t <= chunk.to.getTime(); t += 86_400_000) {
      covered.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  assert.equal(covered.size, 20);
  assert.ok(covered.has("2026-06-01"));
  assert.ok(covered.has("2026-06-20"));
});

test("enqueueMaterializationJob tolerates concurrent enqueue", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Enqueue Org ${suffix}`, slug: `enqueue-${suffix}` },
  });
  try {
    await Promise.all([
      enqueueMaterializationJob(org.id),
      enqueueMaterializationJob(org.id),
      enqueueMaterializationJob(org.id),
    ]);
    const rows = await prisma.analyticsWatermark.count({
      where: {
        orgId: org.id,
        kind: "materialize_dirty",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.equal(rows, 1);
    const watermark = await prisma.analyticsWatermark.findFirst({
      where: {
        orgId: org.id,
        kind: "materialize_dirty",
        metricVersion: ORG_DAY_SNAPSHOT_VERSION,
      },
    });
    assert.equal(watermark?.status, "pending");
  } finally {
    await prisma.analyticsWatermark.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("claimMaterializationJob refuses a second concurrent claim", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Claim Org ${suffix}`, slug: `claim-${suffix}` },
  });
  try {
    await enqueueMaterializationJob(org.id);
    const first = await claimMaterializationJob(org.id);
    assert.equal(first.claimed, true);
    const second = await claimMaterializationJob(org.id);
    assert.equal(second.claimed, false);
  } finally {
    await prisma.analyticsWatermark.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("getWorkspaceSyncReadiness windowDays excludes today and older backlog", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Ready Org ${suffix}`, slug: `ready-${suffix}` },
  });
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const old = new Date(today.getTime() - 40 * 86_400_000);
    await markOrgUsageDaysDirty(org.id, [today, old], ORG_DAY_SNAPSHOT_VERSION);

    const full = await getWorkspaceSyncReadiness(org.id);
    assert.equal(full.dashboardReady, false);
    assert.ok(full.dirtyDayCount >= 2);

    const windowed = await getWorkspaceSyncReadiness(org.id, { windowDays: 14 });
    // Today excluded; 40-day-old dirty is outside the 14-day window → ready.
    assert.equal(windowed.dashboardReady, true);
    assert.ok(windowed.dirtyDayCount >= 2);

    const yesterday = new Date(today.getTime() - 86_400_000);
    await markOrgUsageDaysDirty(org.id, [yesterday], ORG_DAY_SNAPSHOT_VERSION);
    const blocked = await getWorkspaceSyncReadiness(org.id, { windowDays: 14 });
    assert.equal(blocked.dashboardReady, false);
  } finally {
    await prisma.analyticsDirtyDay.deleteMany({ where: { orgId: org.id } });
    await prisma.analyticsWatermark.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
