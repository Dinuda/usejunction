import { test } from "vitest";
import assert from "node:assert/strict";
import { prisma } from "@usejunction/db";
import { materializeOrgUsageRange, readOrgUsageFromSnapshots } from "@/lib/analytics/snapshots";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";

const runDb = Boolean(process.env.DATABASE_URL);

test("warm snapshot reads stay under 300ms after materialize", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Warm Org ${suffix}`, slug: `warm-${suffix}` },
  });
  const from = new Date("2026-07-01T00:00:00.000Z");
  const to = new Date("2026-07-10T00:00:00.000Z");
  const developer = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `warm-${suffix}@example.com`,
      name: "Warm Dev",
      role: "user",
    },
  });

  try {
    for (let i = 0; i < 10; i += 1) {
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
          requests: 3,
          inputTokens: BigInt(100),
          outputTokens: BigInt(20),
          costMicros: BigInt(100_000),
          costKind: "estimated_api",
          dedupeKey: `warm-test:${suffix}:${i}`,
          observedAt: date,
        },
      });
    }

    await materializeOrgUsageRange(org.id, from, to);
    const window = { from, to, timezone: UTC_TIMEZONE, grain: "day" as const };

    // Prime connection / ensure stubs, then measure a warm SUM-only path.
    await readOrgUsageFromSnapshots(org.id, window, { includeTools: true });

    const started = Date.now();
    const warm = await readOrgUsageFromSnapshots(org.id, window, { includeTools: true });
    const durationMs = Date.now() - started;

    assert.equal(warm.kpis.modelCalls, 30);
    assert.ok(durationMs < 500, `warm snapshot read took ${durationMs}ms`);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
