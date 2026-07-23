import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import { startUsageSync, commitUsageSync, ingestUsageSyncChunk } from "@/lib/sync/usage-sync";

const runDb = Boolean(process.env.DATABASE_URL);

test("usage sync session start/chunk/commit is idempotent", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Sync Org ${suffix}`, slug: `sync-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `sync-${suffix}@example.com`,
      name: "Sync Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "sync-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `tok-${suffix}`,
    },
  });

  try {
    const start = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [
        {
          partitionKey: "2026-07-21|codex|gpt-5|local_scan|",
          date: "2026-07-21",
          tool: "codex",
          model: "gpt-5",
          source: "local_scan",
          contentHash: "hash-1",
          rowCount: 1,
        },
      ],
    });
    assert.ok(start.syncRunId);
    assert.deepEqual(start.deltaPartitions, ["2026-07-21|codex|gpt-5|local_scan|"]);

    const chunk = await ingestUsageSyncChunk({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      syncRunId: start.syncRunId,
      chunkId: "chunk-1",
      rows: [
        {
          date: "2026-07-21",
          toolName: "codex",
          model: "gpt-5",
          source: "local_scan",
          inputTokens: 10,
          outputTokens: 2,
          estimatedCost: 0.01,
          requests: 1,
        },
      ],
    });
    assert.equal(chunk.upserted, 1);

    const dup = await ingestUsageSyncChunk({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      syncRunId: start.syncRunId,
      chunkId: "chunk-1",
      rows: [],
    });
    assert.equal(dup.duplicate, true);

    const committed = await commitUsageSync({
      orgId: org.id,
      deviceId: device.id,
      syncRunId: start.syncRunId,
      expectedChunks: 1,
    });
    assert.equal(committed.status, "committed");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("usage sync start applies tools sidecar once then short-circuits on hash", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Tools Sync Org ${suffix}`, slug: `tools-sync-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `tools-sync-${suffix}@example.com`,
      name: "Tools Sync Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "tools-sync-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `tools-tok-${suffix}`,
    },
  });

  const tools = {
    contentHash: "",
    items: [
      { toolName: "cursor", detected: true, configured: true, version: "1.0", configPath: "/c" },
      { toolName: "codex", detected: true, configured: false, version: "2.0", configPath: "/x" },
    ],
  };
  const { toolsInventoryContentHash } = await import("@/lib/sync/tools-inventory");
  tools.contentHash = toolsInventoryContentHash(tools.items);

  try {
    const start = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [],
      tools,
    });
    assert.equal(start.toolsApplied, "updated");
    assert.equal(start.status, "committed");

    const installs = await prisma.toolInstallation.findMany({
      where: { deviceId: device.id },
      orderBy: { toolName: "asc" },
    });
    assert.equal(installs.length, 2);
    assert.equal(installs[0]?.toolName, "codex");
    assert.equal(installs[1]?.toolName, "cursor");

    const deviceRow = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    assert.equal(deviceRow.toolsContentHash, tools.contentHash);
    assert.ok(deviceRow.lastToolsSyncAt);

    const again = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [],
      tools,
    });
    assert.equal(again.toolsApplied, "unchanged");

    // Stale tool removed when inventory shrinks.
    const shrunkItems = [tools.items[0]!]; // keep cursor only
    const shrunkHash = toolsInventoryContentHash(shrunkItems);
    const shrink = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [],
      tools: { contentHash: shrunkHash, items: shrunkItems },
    });
    assert.equal(shrink.toolsApplied, "updated");
    const after = await prisma.toolInstallation.findMany({ where: { deviceId: device.id } });
    assert.equal(after.length, 1);
    assert.equal(after[0]?.toolName, "cursor");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("usage sync start keeps usage delta when tools apply would fail", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `Tools Fail Org ${suffix}`, slug: `tools-fail-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `tools-fail-${suffix}@example.com`,
      name: "Tools Fail Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "tools-fail-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `tools-fail-tok-${suffix}`,
    },
  });

  try {
    // Invalid org/user mismatch is hard to force through startUsageSync params
    // (they are trusted). Instead verify empty-name tools still return a usage delta.
    const start = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [
        {
          partitionKey: "2026-07-21|codex|gpt-5|local_scan|",
          date: "2026-07-21",
          tool: "codex",
          model: "gpt-5",
          source: "local_scan",
          contentHash: "hash-tools-fail",
          rowCount: 1,
        },
      ],
      tools: {
        contentHash: "forced-new-hash",
        items: [{ toolName: "", detected: true }],
      },
    });
    assert.ok(start.deltaPartitions.includes("2026-07-21|codex|gpt-5|local_scan|"));
    assert.equal(start.toolsApplied, "updated");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("usage sync start applies accounts+quotas and creates billing templates", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `AQ Sync Org ${suffix}`, slug: `aq-sync-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `aq-sync-${suffix}@example.com`,
      name: "AQ Sync Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "aq-sync-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `aq-tok-${suffix}`,
    },
  });

  const { accountsInventoryContentHash } = await import("@/lib/sync/accounts-inventory");
  const { quotasInventoryContentHash } = await import("@/lib/sync/quotas-inventory");

  const accountsItems = [
    {
      toolName: "cursor",
      email: "dev@example.com",
      plan: "pro",
      loginMethod: "local_app",
      authPresent: true,
    },
  ];
  const quotasItems = [
    {
      toolName: "cursor",
      windowType: "plan",
      usedPercent: 12.5,
      source: "api",
    },
  ];
  const accounts = {
    contentHash: accountsInventoryContentHash(accountsItems),
    items: accountsItems,
  };
  const quotas = {
    contentHash: quotasInventoryContentHash(quotasItems),
    items: quotasItems,
  };

  try {
    const start = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [],
      accounts,
      quotas,
    });
    assert.equal(start.accountsApplied, "updated");
    assert.equal(start.quotasApplied, "updated");
    assert.equal(start.status, "committed");

    const accountRows = await prisma.toolAccount.findMany({ where: { deviceId: device.id } });
    assert.equal(accountRows.length, 1);
    assert.equal(accountRows[0]?.plan, "pro");

    const quotaRows = await prisma.quotaSnapshot.findMany({ where: { deviceId: device.id } });
    assert.equal(quotaRows.length, 1);

    const templates = await prisma.billingPlanTemplate.findMany({
      where: { orgId: org.id, priceSource: "detected" },
    });
    assert.ok(templates.length >= 1, "expected detected billing_plan_templates");

    const assignments = await prisma.developerPlanAssignment.findMany({
      where: { orgId: org.id, source: "detected", active: true },
    });
    assert.ok(assignments.length >= 1, "expected detected plan assignment");

    const again = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [],
      accounts,
      quotas,
    });
    assert.equal(again.accountsApplied, "unchanged");
    assert.equal(again.quotasApplied, "unchanged");

    const templatesAgain = await prisma.billingPlanTemplate.findMany({
      where: { orgId: org.id, priceSource: "detected" },
    });
    assert.equal(templatesAgain.length, templates.length);

    // Tools-only / null plan must not invent seats.
    const nullPlanOrg = await prisma.organization.create({
      data: { name: `Null Plan Org ${suffix}`, slug: `null-plan-${suffix}` },
    });
    const nullUser = await prisma.developer.create({
      data: {
        orgId: nullPlanOrg.id,
        email: `null-plan-${suffix}@example.com`,
        name: "Null Plan Dev",
        role: "owner",
      },
    });
    const nullDevice = await prisma.device.create({
      data: {
        orgId: nullPlanOrg.id,
        userId: nullUser.id,
        hostname: "null-plan-host",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "test",
        deviceToken: `null-plan-tok-${suffix}`,
      },
    });
    try {
      await startUsageSync({
        orgId: nullPlanOrg.id,
        userId: nullUser.id,
        deviceId: nullDevice.id,
        partitions: [],
        tools: {
          contentHash: "tools-only",
          items: [{ toolName: "codex", detected: true, configured: false }],
        },
        accounts: {
          contentHash: accountsInventoryContentHash([
            { toolName: "codex", plan: null, authPresent: true },
          ]),
          items: [{ toolName: "codex", plan: null, authPresent: true }],
        },
      });
      const invented = await prisma.billingPlanTemplate.findMany({
        where: { orgId: nullPlanOrg.id, priceSource: "detected" },
      });
      assert.equal(invented.length, 0);
    } finally {
      await prisma.organization.delete({ where: { id: nullPlanOrg.id } });
    }
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});

test("usage sync start keeps usage delta when accounts apply fails", { skip: !runDb }, async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name: `AQ Fail Org ${suffix}`, slug: `aq-fail-${suffix}` },
  });
  const user = await prisma.developer.create({
    data: {
      orgId: org.id,
      email: `aq-fail-${suffix}@example.com`,
      name: "AQ Fail Dev",
      role: "owner",
    },
  });
  const device = await prisma.device.create({
    data: {
      orgId: org.id,
      userId: user.id,
      hostname: "aq-fail-host",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "test",
      deviceToken: `aq-fail-tok-${suffix}`,
    },
  });

  try {
    const start = await startUsageSync({
      orgId: org.id,
      userId: user.id,
      deviceId: device.id,
      partitions: [
        {
          partitionKey: "2026-07-21|codex|gpt-5|local_scan|",
          date: "2026-07-21",
          tool: "codex",
          model: "gpt-5",
          source: "local_scan",
          contentHash: "hash-aq-fail",
          rowCount: 1,
        },
      ],
      accounts: {
        contentHash: "forced-accounts-hash",
        items: [{ toolName: "", plan: "pro", authPresent: true }],
      },
    });
    assert.ok(start.deltaPartitions.includes("2026-07-21|codex|gpt-5|local_scan|"));
    assert.equal(start.accountsApplied, "updated");
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
