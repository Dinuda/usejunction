/**
 * Quota inventory apply + content hash for sync-engine start sidecar.
 * Keep byte-compatible with agent/internal/syncengine/quotas.go.
 */
import { createHash } from "crypto";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";

export type QuotaInventoryItem = {
  toolName: string;
  windowType: string;
  usedPercent?: number | null;
  resetAt?: string | null;
  creditsRemaining?: number | null;
  source?: string | null;
};

const QUOTA_OBSERVATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const QUOTA_SAMPLE_BUCKET_MS = 30 * 60 * 1000;

function quotaSampleBucket(now: Date): Date {
  return new Date(Math.floor(now.getTime() / QUOTA_SAMPLE_BUCKET_MS) * QUOTA_SAMPLE_BUCKET_MS);
}

/** Persist a bounded history of percentage readings for pace projections. */
export async function recordQuotaObservations(params: {
  deviceId: string;
  items: QuotaInventoryItem[];
  observedAt?: Date;
}): Promise<{ recorded: number }> {
  const observedAt = params.observedAt ?? new Date();
  const sampleBucket = quotaSampleBucket(observedAt);
  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    select: { orgId: true },
  });
  if (!device) return { recorded: 0 };
  let recorded = 0;
  for (const item of params.items) {
    const toolName = String(item.toolName ?? "").trim();
    const windowType = String(item.windowType ?? "").trim();
    const resetAt = item.resetAt ? new Date(item.resetAt) : null;
    const usedPercent =
      typeof item.usedPercent === "number" && Number.isFinite(item.usedPercent)
        ? item.usedPercent
        : null;
    if (!toolName || !windowType || !resetAt || Number.isNaN(resetAt.getTime()) || usedPercent == null) continue;
    const existing = await prisma.quotaObservation.findFirst({
      where: { deviceId: params.deviceId, toolName, windowType, resetAt, sampleBucket },
      select: { id: true },
    });
    if (existing) {
      await prisma.quotaObservation.update({
        where: { id: existing.id },
        data: { usedPercent, observedAt },
      });
    } else {
      await prisma.quotaObservation.create({
        data: {
          orgId: device.orgId,
          deviceId: params.deviceId,
          toolName,
          windowType,
          resetAt,
          usedPercent,
          observedAt,
          sampleBucket,
        },
      });
    }
    recorded += 1;
  }
  await prisma.quotaObservation.deleteMany({
    where: { deviceId: params.deviceId, observedAt: { lt: new Date(observedAt.getTime() - QUOTA_OBSERVATION_RETENTION_MS) } },
  });
  return { recorded };
}

export function quotasInventoryCanonicalLine(item: QuotaInventoryItem): string {
  const toolName = String(item.toolName ?? "").trim();
  const windowType = String(item.windowType ?? "").trim();
  const used =
    typeof item.usedPercent === "number" && Number.isFinite(item.usedPercent)
      ? String(item.usedPercent)
      : "";
  const resetAt = String(item.resetAt ?? "").trim();
  const credits =
    typeof item.creditsRemaining === "number" && Number.isFinite(item.creditsRemaining)
      ? String(item.creditsRemaining)
      : "";
  const source = String(item.source ?? "").trim();
  return `${toolName}|${windowType}|${used}|${resetAt}|${credits}|${source}`;
}

export function quotasInventoryContentHash(items: QuotaInventoryItem[]): string {
  const lines = items
    .filter((item) => String(item.toolName ?? "").trim() && String(item.windowType ?? "").trim())
    .map(quotasInventoryCanonicalLine)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32);
}

export async function applyDeviceQuotaInventory(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  items: QuotaInventoryItem[];
  contentHash: string;
}): Promise<{ upserted: number; pruned: number }> {
  const started = Date.now();
  let upserted = 0;
  let pruned = 0;
  const sample: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
  }> = [];
  const windowsByTool = new Map<string, Set<string>>();

  for (const snap of params.items) {
    const toolName = String(snap.toolName ?? "").trim();
    const windowType = String(snap.windowType ?? "").trim();
    if (!toolName || !windowType) continue;

    const windows = windowsByTool.get(toolName) ?? new Set<string>();
    windows.add(windowType);
    windowsByTool.set(toolName, windows);

    const existing = await prisma.quotaSnapshot.findFirst({
      where: { deviceId: params.deviceId, toolName, windowType },
    });

    const usedPercent =
      typeof snap.usedPercent === "number" && Number.isFinite(snap.usedPercent) ? snap.usedPercent : null;
    const creditsRemaining =
      typeof snap.creditsRemaining === "number" && Number.isFinite(snap.creditsRemaining)
        ? snap.creditsRemaining
        : null;
    const resetAt = snap.resetAt ? new Date(snap.resetAt) : null;
    const source = snap.source?.trim() || "cli_rpc";

    if (existing) {
      await prisma.quotaSnapshot.update({
        where: { id: existing.id },
        data: {
          usedPercent,
          resetAt,
          creditsRemaining,
          source,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.quotaSnapshot.create({
        data: {
          orgId: params.orgId,
          deviceId: params.deviceId,
          toolName,
          windowType,
          usedPercent,
          resetAt,
          creditsRemaining,
          source,
        },
      });
    }
    if (sample.length < 8) {
      sample.push({ toolName, windowType, usedPercent, creditsRemaining });
    }
    upserted += 1;
  }

  // Authoritative inventory: empty payload means no live windows on this device.
  if (params.items.length === 0) {
    const result = await prisma.quotaSnapshot.deleteMany({
      where: { deviceId: params.deviceId },
    });
    pruned += result.count;
  } else {
    for (const [toolName, windowTypes] of windowsByTool) {
      const result = await prisma.quotaSnapshot.deleteMany({
        where: {
          deviceId: params.deviceId,
          toolName,
          windowType: { notIn: [...windowTypes] },
        },
      });
      pruned += result.count;
    }
  }

  await recordQuotaObservations({ deviceId: params.deviceId, items: params.items });

  const now = new Date();
  await prisma.device.update({
    where: { id: params.deviceId },
    data: {
      lastSeenAt: now,
      lastQuotasSyncAt: now,
      quotasContentHash: params.contentHash,
    },
  });

  const toolNames = uniqueStrings(sample.map((row) => row.toolName));
  await recordDeviceActivityEvent({
    orgId: params.orgId,
    developerId: params.userId,
    deviceId: params.deviceId,
    kind: "quota",
    status: "ok",
    summary: `Quota sync · ${upserted} snapshots${toolNames.length ? ` · ${toolNames.join(", ")}` : ""}`,
    requestSummary: { quotas: upserted, pruned, tools: toolNames, sample, via: "sync-start" },
    responseSummary: { upserted, pruned },
    durationMs: Date.now() - started,
  });

  return { upserted, pruned };
}

/** Drop snapshots for tools that reported an account but no quota windows. */
export async function pruneQuotaToolsMissingWindows(params: {
  deviceId: string;
  accountTools: string[];
  quotaTools: string[];
}): Promise<number> {
  const withWindows = new Set(
    params.quotaTools.map((tool) => tool.trim()).filter(Boolean),
  );
  const missing = [
    ...new Set(
      params.accountTools
        .map((tool) => tool.trim())
        .filter((tool) => tool && !withWindows.has(tool)),
    ),
  ];
  if (!missing.length) return 0;
  const result = await prisma.quotaSnapshot.deleteMany({
    where: { deviceId: params.deviceId, toolName: { in: missing } },
  });
  return result.count;
}
