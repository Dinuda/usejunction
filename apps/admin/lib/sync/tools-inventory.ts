/**
 * Tool inventory apply + content hash for sync-engine start sidecar.
 * Keep byte-compatible with agent/internal/syncengine/tools.go.
 */
import { createHash } from "crypto";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";

export type ToolInventoryItem = {
  toolName: string;
  detected?: boolean;
  configured?: boolean;
  configPath?: string | null;
  version?: string | null;
};

export type ToolsAppliedStatus = "unchanged" | "updated" | "failed" | "skipped";

/** Canonical line per tool; sorted by toolName before hashing. */
export function toolsInventoryCanonicalLine(item: ToolInventoryItem): string {
  const toolName = String(item.toolName ?? "").trim();
  const detected = item.detected === false ? "0" : "1";
  const configured = item.configured ? "1" : "0";
  const version = String(item.version ?? "").trim();
  const configPath = String(item.configPath ?? "").trim();
  return `${toolName}|${detected}|${configured}|${version}|${configPath}`;
}

export function toolsInventoryContentHash(items: ToolInventoryItem[]): string {
  const lines = items
    .filter((item) => String(item.toolName ?? "").trim())
    .map(toolsInventoryCanonicalLine)
    .sort();
  const payload = lines.join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/**
 * Authoritative replace of tool_installations for a device.
 * Caller should only invoke when content hash changed.
 */
export async function applyDeviceToolInventory(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  items: ToolInventoryItem[];
  contentHash: string;
}): Promise<{ upserted: number; names: string[] }> {
  const started = Date.now();
  let upserted = 0;
  const reportedNames: string[] = [];
  const sample: Array<{ toolName: string; version: string | null; configured: boolean }> = [];

  for (const tool of params.items) {
    const toolName = String(tool.toolName ?? "").trim();
    if (!toolName) continue;
    const detected = tool.detected !== false;
    if (!detected) continue;
    reportedNames.push(toolName);

    await prisma.toolInstallation.upsert({
      where: { deviceId_toolName: { deviceId: params.deviceId, toolName } },
      update: {
        detected: true,
        configured: Boolean(tool.configured),
        configPath: tool.configPath ?? null,
        version: tool.version ?? null,
        lastCheckedAt: new Date(),
      },
      create: {
        orgId: params.orgId,
        userId: params.userId,
        deviceId: params.deviceId,
        toolName,
        detected: true,
        configured: Boolean(tool.configured),
        configPath: tool.configPath ?? null,
        version: tool.version ?? null,
      },
    });
    if (sample.length < 8) {
      sample.push({
        toolName,
        version: tool.version ?? null,
        configured: Boolean(tool.configured),
      });
    }
    upserted += 1;
  }

  if (reportedNames.length > 0) {
    await prisma.toolInstallation.deleteMany({
      where: {
        deviceId: params.deviceId,
        toolName: { notIn: reportedNames },
      },
    });
  } else {
    await prisma.toolInstallation.deleteMany({ where: { deviceId: params.deviceId } });
  }

  const now = new Date();
  await prisma.device.update({
    where: { id: params.deviceId },
    data: {
      lastSeenAt: now,
      lastToolsSyncAt: now,
      toolsContentHash: params.contentHash,
    },
  });

  const toolNames = uniqueStrings(reportedNames);
  await recordDeviceActivityEvent({
    orgId: params.orgId,
    developerId: params.userId,
    deviceId: params.deviceId,
    kind: "tools",
    status: "ok",
    summary: `Tools sync · ${upserted} tools${toolNames.length ? ` · ${toolNames.join(", ")}` : ""}`,
    requestSummary: { tools: upserted, names: toolNames, sample, via: "sync-start" },
    responseSummary: { upserted },
    durationMs: Date.now() - started,
  });

  return { upserted, names: toolNames };
}
