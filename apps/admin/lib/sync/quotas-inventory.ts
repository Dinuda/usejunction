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
}): Promise<{ upserted: number }> {
  const started = Date.now();
  let upserted = 0;
  const sample: Array<{
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
  }> = [];

  for (const snap of params.items) {
    const toolName = String(snap.toolName ?? "").trim();
    const windowType = String(snap.windowType ?? "").trim();
    if (!toolName || !windowType) continue;

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
    requestSummary: { quotas: upserted, tools: toolNames, sample, via: "sync-start" },
    responseSummary: { upserted },
    durationMs: Date.now() - started,
  });

  return { upserted };
}
