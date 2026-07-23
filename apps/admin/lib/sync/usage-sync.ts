/**
 * Server-orchestrated usage sync sessions (UUS v1).
 * start → chunk(s) → commit, with server-side delta + per-day reconciliation.
 */
import { createHash } from "crypto";
import { prisma } from "@usejunction/db";
import { normalizeUusWireRecord, uusContentFingerprint, uusPartitionKey } from "@usejunction/usage-schema";
import { ingestLocalUsageBatch, type LocalUsageInputRow } from "@/lib/ingest/local-usage-batch";
import { invalidateAnalyticsCache } from "@/lib/analytics/query/invalidation";
import { markOrgUsageDaysDirty, ORG_DAY_SNAPSHOT_VERSION } from "@/lib/analytics/snapshots";
import { enqueueMaterializationJob } from "@/lib/analytics/snapshots/jobs";
import { logServerError } from "@/lib/errors/public";
import {
  applyDeviceToolInventory,
  toolsInventoryContentHash,
  type ToolInventoryItem,
  type ToolsAppliedStatus,
} from "@/lib/sync/tools-inventory";
import {
  applyDeviceAccountInventory,
  accountsInventoryContentHash,
  type AccountInventoryItem,
  type SidecarAppliedStatus,
} from "@/lib/sync/accounts-inventory";
import {
  applyDeviceQuotaInventory,
  quotasInventoryContentHash,
  type QuotaInventoryItem,
} from "@/lib/sync/quotas-inventory";
import { repairDetectedPlanCycles, syncDetectedPlansForDevice } from "@/lib/tools/sync-detected";

export type ManifestPartition = {
  partitionKey: string;
  date: string;
  tool: string;
  model: string;
  source: string;
  repository?: { host: string; owner: string; name: string } | null;
  contentHash: string;
  rowCount?: number;
};

function hashManifest(partitions: ManifestPartition[]): string {
  const payload = partitions
    .map((p) => `${p.partitionKey}:${p.contentHash}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function utcDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export async function startUsageSync(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  partitions: ManifestPartition[];
  tools?: { contentHash?: string; items?: ToolInventoryItem[] } | null;
  accounts?: { contentHash?: string; items?: AccountInventoryItem[] } | null;
  quotas?: { contentHash?: string; items?: QuotaInventoryItem[] } | null;
}): Promise<{
  syncRunId: string;
  deltaPartitions: string[];
  expectedRows: number;
  status: string;
  toolsApplied: ToolsAppliedStatus;
  toolsWarning?: string;
  accountsApplied: SidecarAppliedStatus;
  accountsWarning?: string;
  quotasApplied: SidecarAppliedStatus;
  quotasWarning?: string;
}> {
  let toolsApplied: ToolsAppliedStatus = "skipped";
  let toolsWarning: string | undefined;
  let accountsApplied: SidecarAppliedStatus = "skipped";
  let accountsWarning: string | undefined;
  let quotasApplied: SidecarAppliedStatus = "skipped";
  let quotasWarning: string | undefined;
  let accountsReported: Array<{ toolName: string; plan: string | null; email: string | null }> = [];
  let inventoryChanged = false;

  if (params.tools && Array.isArray(params.tools.items)) {
    const items = params.tools.items;
    const contentHash =
      typeof params.tools.contentHash === "string" && params.tools.contentHash.trim()
        ? params.tools.contentHash.trim()
        : toolsInventoryContentHash(items);

    try {
      const device = await prisma.device.findFirst({
        where: { id: params.deviceId, orgId: params.orgId },
        select: { toolsContentHash: true },
      });
      if (device?.toolsContentHash && device.toolsContentHash === contentHash) {
        toolsApplied = "unchanged";
      } else {
        await applyDeviceToolInventory({
          orgId: params.orgId,
          userId: params.userId,
          deviceId: params.deviceId,
          items,
          contentHash,
        });
        toolsApplied = "updated";
        inventoryChanged = true;
      }
    } catch (error) {
      toolsApplied = "failed";
      toolsWarning = error instanceof Error ? error.message : "tools apply failed";
      logServerError("sync/usage/start-tools", error, {
        orgId: params.orgId,
        deviceId: params.deviceId,
      });
    }
  }

  if (params.accounts && Array.isArray(params.accounts.items)) {
    const items = params.accounts.items;
    const contentHash =
      typeof params.accounts.contentHash === "string" && params.accounts.contentHash.trim()
        ? params.accounts.contentHash.trim()
        : accountsInventoryContentHash(items);

    try {
      const device = await prisma.device.findFirst({
        where: { id: params.deviceId, orgId: params.orgId },
        select: { accountsContentHash: true },
      });
      if (device?.accountsContentHash && device.accountsContentHash === contentHash) {
        accountsApplied = "unchanged";
      } else {
        const applied = await applyDeviceAccountInventory({
          orgId: params.orgId,
          userId: params.userId,
          deviceId: params.deviceId,
          items,
          contentHash,
          // Defer plan sync until quotas also land in this same start.
          runPlanSync: false,
        });
        accountsReported = applied.reported;
        accountsApplied = "updated";
        inventoryChanged = true;
      }
    } catch (error) {
      accountsApplied = "failed";
      accountsWarning = error instanceof Error ? error.message : "accounts apply failed";
      logServerError("sync/usage/start-accounts", error, {
        orgId: params.orgId,
        deviceId: params.deviceId,
      });
    }
  }

  if (params.quotas && Array.isArray(params.quotas.items)) {
    const items = params.quotas.items;
    const contentHash =
      typeof params.quotas.contentHash === "string" && params.quotas.contentHash.trim()
        ? params.quotas.contentHash.trim()
        : quotasInventoryContentHash(items);

    try {
      const device = await prisma.device.findFirst({
        where: { id: params.deviceId, orgId: params.orgId },
        select: { quotasContentHash: true },
      });
      if (device?.quotasContentHash && device.quotasContentHash === contentHash) {
        quotasApplied = "unchanged";
      } else {
        await applyDeviceQuotaInventory({
          orgId: params.orgId,
          userId: params.userId,
          deviceId: params.deviceId,
          items,
          contentHash,
        });
        quotasApplied = "updated";
        inventoryChanged = true;
      }
    } catch (error) {
      quotasApplied = "failed";
      quotasWarning = error instanceof Error ? error.message : "quotas apply failed";
      logServerError("sync/usage/start-quotas", error, {
        orgId: params.orgId,
        deviceId: params.deviceId,
      });
    }
  }

  // Materialize billing templates/seats once accounts and/or quotas changed.
  if (inventoryChanged && (accountsApplied === "updated" || quotasApplied === "updated" || accountsReported.length > 0)) {
    try {
      let accounts = accountsReported;
      if (!accounts.length) {
        const rows = await prisma.toolAccount.findMany({
          where: { deviceId: params.deviceId },
          select: { toolName: true, plan: true, email: true },
        });
        accounts = rows.map((row) => ({
          toolName: row.toolName,
          plan: row.plan,
          email: row.email,
        }));
      }
      if (accounts.length) {
        await syncDetectedPlansForDevice({
          orgId: params.orgId,
          developerId: params.userId,
          accounts,
        });
      }
      await repairDetectedPlanCycles(params.orgId);
    } catch (error) {
      logServerError("sync/usage/start-plan-sync", error, {
        orgId: params.orgId,
        deviceId: params.deviceId,
      });
    }
  }

  const partitions = params.partitions.filter((p) => p.partitionKey && p.date && p.contentHash);
  const keys = partitions.map((p) => p.partitionKey);
  const existing = keys.length
    ? await prisma.deviceUsageFingerprint.findMany({
        where: { deviceId: params.deviceId, partitionKey: { in: keys } },
        select: { partitionKey: true, contentHash: true },
      })
    : [];
  const byKey = new Map(existing.map((row) => [row.partitionKey, row.contentHash]));
  const delta = partitions.filter((p) => byKey.get(p.partitionKey) !== p.contentHash);
  const expectedRows = delta.reduce((sum, p) => sum + Math.max(1, p.rowCount ?? 1), 0);
  const dates = partitions.map((p) => p.date).sort();
  const windowFrom = dates[0] ? utcDate(dates[0]) : null;
  const windowTo = dates.length ? utcDate(dates[dates.length - 1]!) : null;

  // Close orphaned receiving runs so a new collect cannot leave the device stuck
  // on a prior partial session (e.g. missing-partition commit failures).
  await prisma.syncRun.updateMany({
    where: {
      orgId: params.orgId,
      deviceId: params.deviceId,
      status: "receiving",
    },
    data: {
      status: "superseded",
      error: "superseded by new sync run",
      updatedAt: new Date(),
    },
  });

  const run = await prisma.syncRun.create({
    data: {
      orgId: params.orgId,
      deviceId: params.deviceId,
      kind: "usage",
      status: delta.length ? "receiving" : "committed",
      expectedChunks: 0,
      receivedChunks: 0,
      expectedRows,
      receivedRows: 0,
      manifestHash: hashManifest(partitions),
      deltaPartitions: delta.map((p) => p.partitionKey),
      manifestPartitions: partitions.map((p) => p.partitionKey),
      windowFrom,
      windowTo,
      committedAt: delta.length ? null : new Date(),
    },
  });

  if (!delta.length) {
    // Still reconcile in case partitions disappeared from the lookback window.
    await reconcileDeviceDayPartitions({
      orgId: params.orgId,
      deviceId: params.deviceId,
      manifestPartitions: partitions,
      windowFrom,
      windowTo,
    });
    await enqueueMaterializationJob(params.orgId);
  }

  return {
    syncRunId: run.id,
    deltaPartitions: delta.map((p) => p.partitionKey),
    expectedRows,
    status: run.status,
    toolsApplied,
    ...(toolsWarning ? { toolsWarning } : {}),
    accountsApplied,
    ...(accountsWarning ? { accountsWarning } : {}),
    quotasApplied,
    ...(quotasWarning ? { quotasWarning } : {}),
  };
}

export async function ingestUsageSyncChunk(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  syncRunId: string;
  chunkId: string;
  contentHash?: string;
  rows: LocalUsageInputRow[];
  observedAt?: Date;
}): Promise<{ upserted: number; duplicate: boolean; receivedChunks: number; receivedRows: number }> {
  const run = await prisma.syncRun.findFirst({
    where: { id: params.syncRunId, orgId: params.orgId, deviceId: params.deviceId },
  });
  if (!run) throw new Error("sync run not found");
  if (run.status === "committed" || run.status === "failed") {
    throw new Error(`sync run is ${run.status}`);
  }

  const existing = await prisma.syncChunk.findUnique({
    where: { syncRunId_chunkId: { syncRunId: params.syncRunId, chunkId: params.chunkId } },
  });
  if (existing) {
    return {
      upserted: 0,
      duplicate: true,
      receivedChunks: run.receivedChunks,
      receivedRows: run.receivedRows,
    };
  }

  const observedAt = params.observedAt ?? new Date();
  const { upserted } = await ingestLocalUsageBatch({
    orgId: params.orgId,
    userId: params.userId,
    deviceId: params.deviceId,
    rows: params.rows,
    observedAt,
    monotonicObservedAt: true,
  });

  // Update fingerprints for uploaded rows.
  const fps: Array<{ partitionKey: string; contentHash: string; date: Date }> = [];
  for (const raw of params.rows) {
    const normalized = normalizeUusWireRecord(raw as Record<string, unknown>);
    if (!normalized) continue;
    const partitionKey = uusPartitionKey({
      date: normalized.date,
      tool: normalized.tool,
      model: normalized.model ?? "",
      source: normalized.source,
      repository: normalized.repository,
    });
    fps.push({
      partitionKey,
      contentHash: uusContentFingerprint(normalized),
      date: utcDate(normalized.date),
    });
  }
  for (const fp of fps) {
    await prisma.deviceUsageFingerprint.upsert({
      where: { deviceId_partitionKey: { deviceId: params.deviceId, partitionKey: fp.partitionKey } },
      create: {
        orgId: params.orgId,
        deviceId: params.deviceId,
        partitionKey: fp.partitionKey,
        contentHash: fp.contentHash,
        date: fp.date,
      },
      update: { contentHash: fp.contentHash, date: fp.date },
    });
  }

  const dirtyDates = params.rows
    .map((row) => (typeof row.date === "string" ? row.date.slice(0, 10) : null))
    .filter((value): value is string => Boolean(value));
  await invalidateAnalyticsCache(params.orgId, {
    dirtyDates: dirtyDates.length ? dirtyDates : [new Date()],
    // Match legacy /api/ingest/local-usage: first/small syncs rematerialize inline
    // so dashboards do not sit on empty stubs waiting for cron.
    preferFirstSyncRematerialize: true,
  });

  await prisma.syncChunk.create({
    data: {
      syncRunId: params.syncRunId,
      deviceId: params.deviceId,
      chunkId: params.chunkId,
      rowCount: upserted,
      contentHash: params.contentHash ?? "",
    },
  });

  const updated = await prisma.syncRun.update({
    where: { id: params.syncRunId },
    data: {
      status: "receiving",
      receivedChunks: { increment: 1 },
      receivedRows: { increment: upserted },
    },
  });

  return {
    upserted,
    duplicate: false,
    receivedChunks: updated.receivedChunks,
    receivedRows: updated.receivedRows,
  };
}

export async function commitUsageSync(params: {
  orgId: string;
  deviceId: string;
  syncRunId: string;
  expectedChunks?: number;
}): Promise<{
  status: string;
  receivedChunks: number;
  receivedRows: number;
  missingPartitions: string[];
  dirtyRemaining: number;
}> {
  const run = await prisma.syncRun.findFirst({
    where: { id: params.syncRunId, orgId: params.orgId, deviceId: params.deviceId },
  });
  if (!run) throw new Error("sync run not found");
  if (run.status === "committed") {
    const dirtyRemaining = await prisma.analyticsDirtyDay.count({
      where: { orgId: params.orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    return {
      status: "committed",
      receivedChunks: run.receivedChunks,
      receivedRows: run.receivedRows,
      missingPartitions: [],
      dirtyRemaining,
    };
  }

  const delta = Array.isArray(run.deltaPartitions) ? (run.deltaPartitions as string[]) : [];
  const received = await prisma.deviceUsageFingerprint.findMany({
    where: { deviceId: params.deviceId, partitionKey: { in: delta } },
    select: { partitionKey: true },
  });
  const have = new Set(received.map((row) => row.partitionKey));
  const missingPartitions = delta.filter((key) => !have.has(key));

  if (typeof params.expectedChunks === "number" && params.expectedChunks > 0) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { expectedChunks: params.expectedChunks },
    });
  }

  if (missingPartitions.length) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "receiving", error: `missing ${missingPartitions.length} partitions` },
    });
    // Partial progress still landed in usage_daily — enqueue materialize so the
    // dashboard improves incrementally instead of waiting for a perfect commit.
    try {
      await enqueueMaterializationJob(params.orgId);
    } catch (error) {
      logServerError("sync/partial-commit-materialize", error, { orgId: params.orgId, syncRunId: run.id });
    }
    const dirtyRemaining = await prisma.analyticsDirtyDay.count({
      where: { orgId: params.orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
    });
    return {
      status: "receiving",
      receivedChunks: run.receivedChunks,
      receivedRows: run.receivedRows,
      missingPartitions,
      dirtyRemaining,
    };
  }

  const manifestKeys = Array.isArray(run.manifestPartitions) ? (run.manifestPartitions as string[]) : [];
  const manifestPartitions: ManifestPartition[] = manifestKeys.map((partitionKey) => {
    const [date = "", tool = "", model = "", source = "", ...repoParts] = partitionKey.split("|");
    const repoStr = repoParts.join("|");
    const repoBits = repoStr ? repoStr.split("/") : [];
    return {
      partitionKey,
      date,
      tool,
      model,
      source,
      repository:
        repoBits.length === 3
          ? { host: repoBits[0]!, owner: repoBits[1]!, name: repoBits[2]! }
          : null,
      contentHash: "",
    };
  });

  await reconcileDeviceDayPartitions({
    orgId: params.orgId,
    deviceId: params.deviceId,
    manifestPartitions,
    windowFrom: run.windowFrom,
    windowTo: run.windowTo,
  });

  await prisma.device.update({
    where: { id: params.deviceId },
    data: { lastUsageSyncAt: new Date(), lastSeenAt: new Date() },
  });

  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status: "committed", committedAt: new Date(), error: null },
  });

  await enqueueMaterializationJob(params.orgId);

  const dirtyRemaining = await prisma.analyticsDirtyDay.count({
    where: { orgId: params.orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
  });

  return {
    status: "committed",
    receivedChunks: run.receivedChunks,
    receivedRows: run.receivedRows,
    missingPartitions: [],
    dirtyRemaining,
  };
}

export async function getUsageSyncStatus(params: {
  orgId: string;
  deviceId: string;
  syncRunId: string;
}) {
  const run = await prisma.syncRun.findFirst({
    where: { id: params.syncRunId, orgId: params.orgId, deviceId: params.deviceId },
  });
  if (!run) return null;
  const dirtyRemaining = await prisma.analyticsDirtyDay.count({
    where: { orgId: params.orgId, metricVersion: ORG_DAY_SNAPSHOT_VERSION },
  });
  return {
    syncRunId: run.id,
    status: run.status,
    expectedChunks: run.expectedChunks,
    receivedChunks: run.receivedChunks,
    expectedRows: run.expectedRows,
    receivedRows: run.receivedRows,
    error: run.error,
    committedAt: run.committedAt?.toISOString() ?? null,
    dirtyRemaining,
    progress:
      run.expectedRows > 0 ? Math.min(1, run.receivedRows / run.expectedRows) : run.status === "committed" ? 1 : 0,
  };
}

/**
 * Tombstone / delete stored partitions for days in the window that are absent
 * from the authoritative lookback manifest.
 */
export async function reconcileDeviceDayPartitions(params: {
  orgId: string;
  deviceId: string;
  manifestPartitions: ManifestPartition[];
  windowFrom: Date | null;
  windowTo: Date | null;
}): Promise<{ removed: number }> {
  if (!params.windowFrom || !params.windowTo) return { removed: 0 };

  const manifestByDay = new Map<string, Set<string>>();
  for (const part of params.manifestPartitions) {
    const day = part.date.slice(0, 10);
    const set = manifestByDay.get(day) ?? new Set<string>();
    set.add(part.partitionKey);
    manifestByDay.set(day, set);
  }

  const stored = await prisma.deviceUsageFingerprint.findMany({
    where: {
      deviceId: params.deviceId,
      date: { gte: params.windowFrom, lte: params.windowTo },
    },
    select: { id: true, partitionKey: true, date: true },
  });

  const orphanKeys: string[] = [];
  const orphanDays = new Set<string>();
  for (const row of stored) {
    const day = row.date.toISOString().slice(0, 10);
    const allowed = manifestByDay.get(day);
    // Only reconcile days present in the manifest (agent scanned that day).
    if (!allowed) continue;
    if (!allowed.has(row.partitionKey)) {
      orphanKeys.push(row.partitionKey);
      orphanDays.add(day);
    }
  }

  if (!orphanKeys.length) return { removed: 0 };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.deviceUsageFingerprint.deleteMany({
        where: { deviceId: params.deviceId, partitionKey: { in: orphanKeys } },
      });
      // Soft-delete matching usage_daily / local aggregates by reconstructing dedupe dimensions is hard;
      // delete local_usage_aggregates rows whose composite key matches orphan partitions.
      for (const key of orphanKeys) {
        const [date = "", tool = "", model = "", source = "", ...repoParts] = key.split("|");
        const repositoryKey = repoParts.join("|");
        await tx.localUsageAggregate.deleteMany({
          where: {
            deviceId: params.deviceId,
            date: utcDate(date),
            toolName: tool,
            model,
            source,
            repositoryKey: repositoryKey || "",
          },
        });
        await tx.usageDaily.deleteMany({
          where: {
            deviceId: params.deviceId,
            date: utcDate(date),
            toolName: tool,
            model,
            // source on usage_daily is canonical; match via dedupeKey prefix when possible
            dedupeKey: {
              contains: `:${date}:${tool}:${model}:`,
            },
          },
        });
      }
    });

    if (orphanDays.size) {
      await markOrgUsageDaysDirty(params.orgId, [...orphanDays].map((d) => utcDate(d)));
    }
  } catch (error) {
    logServerError("sync/reconcile_partitions", error, {
      orgId: params.orgId,
      deviceId: params.deviceId,
      orphanCount: orphanKeys.length,
    });
  }

  return { removed: orphanKeys.length };
}
