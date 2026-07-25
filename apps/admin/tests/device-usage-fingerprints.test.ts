import assert from "node:assert/strict";
import { test } from "vitest";
import {
  bulkUpsertDeviceUsageFingerprints,
  collapseDeviceUsageFingerprints,
} from "@/lib/sync/device-usage-fingerprints";

test("collapseDeviceUsageFingerprints keeps last-write per partition key", () => {
  const day = new Date("2026-07-21T00:00:00.000Z");
  const collapsed = collapseDeviceUsageFingerprints([
    { partitionKey: "a", contentHash: "h1", date: day },
    { partitionKey: "b", contentHash: "h2", date: day },
    { partitionKey: "a", contentHash: "h3", date: day },
  ]);
  assert.equal(collapsed.length, 2);
  const a = collapsed.find((row) => row.partitionKey === "a");
  assert.equal(a?.contentHash, "h3");
});

import { prisma } from "@usejunction/db";

const runDb = Boolean(process.env.DATABASE_URL);

test("bulkUpsertDeviceUsageFingerprints lands many rows in one path", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `FP Bulk Org ${suffix}`, slug: `fp-bulk-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `fp-bulk-${suffix}@example.com`,
      name: "FP Bulk Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "fp-bulk-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `fp-bulk-tok-${suffix}`,
    },
  });

  const day = new Date("2026-07-21T00:00:00.000Z");
  const rows = Array.from({ length: 120 }, (_, i) => ({
    partitionKey: `2026-07-21|codex|model-${i}|local_scan|`,
    contentHash: `hash-${i}`,
    date: day,
  }));

  try {
    const upserted = await bulkUpsertDeviceUsageFingerprints({
      orgId: org.id,
      deviceId: device.id,
      rows,
    });
    assert.equal(upserted, 120);

    const stored = await prisma.deviceUsageFingerprint.count({ where: { deviceId: device.id } });
    assert.equal(stored, 120);

    // Update path: same keys with new hashes should not duplicate rows.
    await bulkUpsertDeviceUsageFingerprints({
      orgId: org.id,
      deviceId: device.id,
      rows: rows.map((row, i) => ({ ...row, contentHash: `hash-new-${i}` })),
    });
    const afterUpdate = await prisma.deviceUsageFingerprint.count({ where: { deviceId: device.id } });
    assert.equal(afterUpdate, 120);
    const sample = await prisma.deviceUsageFingerprint.findFirst({
      where: { deviceId: device.id, partitionKey: rows[0]!.partitionKey },
    });
    assert.equal(sample?.contentHash, "hash-new-0");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
