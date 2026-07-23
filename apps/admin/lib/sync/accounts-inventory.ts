/**
 * Account inventory apply + content hash for sync-engine start sidecar.
 * Keep byte-compatible with agent/internal/syncengine/accounts.go.
 */
import { createHash } from "crypto";
import { prisma } from "@usejunction/db";
import {
  recordDeviceActivityEvent,
  uniqueStrings,
} from "@/lib/activity/record-device-activity-event";
import { syncDetectedPlansForDevice } from "@/lib/tools/sync-detected";
import { logServerError } from "@/lib/errors/public";

export type AccountInventoryItem = {
  toolName: string;
  email?: string | null;
  plan?: string | null;
  loginMethod?: string | null;
  authPresent?: boolean;
};

export type SidecarAppliedStatus = "unchanged" | "updated" | "failed" | "skipped";

export function accountsInventoryCanonicalLine(item: AccountInventoryItem): string {
  const toolName = String(item.toolName ?? "").trim();
  const email = String(item.email ?? "").trim();
  const plan = String(item.plan ?? "").trim();
  const loginMethod = String(item.loginMethod ?? "").trim();
  const authPresent = item.authPresent ? "1" : "0";
  return `${toolName}|${email}|${plan}|${loginMethod}|${authPresent}`;
}

export function accountsInventoryContentHash(items: AccountInventoryItem[]): string {
  const lines = items
    .filter((item) => String(item.toolName ?? "").trim())
    .map(accountsInventoryCanonicalLine)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32);
}

export async function applyDeviceAccountInventory(params: {
  orgId: string;
  userId: string;
  deviceId: string;
  items: AccountInventoryItem[];
  contentHash: string;
  runPlanSync?: boolean;
}): Promise<{ upserted: number; reported: Array<{ toolName: string; plan: string | null; email: string | null }> }> {
  const started = Date.now();
  let upserted = 0;
  const reported: Array<{ toolName: string; plan: string | null; email: string | null }> = [];

  for (const acct of params.items) {
    const toolName = String(acct.toolName ?? "").trim();
    if (!toolName) continue;

    const existing = await prisma.toolAccount.findUnique({
      where: { deviceId_toolName: { deviceId: params.deviceId, toolName } },
      select: { email: true, plan: true },
    });

    const incomingPlan = typeof acct.plan === "string" ? acct.plan.trim() : "";
    const incomingEmail = typeof acct.email === "string" ? acct.email.trim() : "";
    const plan = incomingPlan || existing?.plan || null;
    const email = incomingEmail || existing?.email || null;

    await prisma.toolAccount.upsert({
      where: { deviceId_toolName: { deviceId: params.deviceId, toolName } },
      update: {
        email,
        plan,
        loginMethod: acct.loginMethod?.trim() || "unknown",
        authPresent: Boolean(acct.authPresent),
        updatedAt: new Date(),
      },
      create: {
        orgId: params.orgId,
        userId: params.userId,
        deviceId: params.deviceId,
        toolName,
        email,
        plan,
        loginMethod: acct.loginMethod?.trim() || "unknown",
        authPresent: Boolean(acct.authPresent),
      },
    });
    reported.push({ toolName, plan, email });
    upserted += 1;
  }

  const now = new Date();
  await prisma.device.update({
    where: { id: params.deviceId },
    data: {
      lastSeenAt: now,
      lastAccountSyncAt: now,
      accountsContentHash: params.contentHash,
    },
  });

  if (params.runPlanSync !== false && reported.length > 0) {
    try {
      await syncDetectedPlansForDevice({
        orgId: params.orgId,
        developerId: params.userId,
        accounts: reported,
      });
    } catch (syncError) {
      logServerError("sync/accounts-plan-sync", syncError, {
        orgId: params.orgId,
        deviceId: params.deviceId,
      });
    }
  }

  const toolNames = uniqueStrings(reported.map((row) => row.toolName));
  await recordDeviceActivityEvent({
    orgId: params.orgId,
    developerId: params.userId,
    deviceId: params.deviceId,
    kind: "accounts",
    status: "ok",
    summary: `Account sync · ${upserted} accounts${toolNames.length ? ` · ${toolNames.join(", ")}` : ""}`,
    requestSummary: {
      accounts: upserted,
      tools: toolNames,
      sample: reported.slice(0, 8),
      via: "sync-start",
    },
    responseSummary: { upserted },
    durationMs: Date.now() - started,
  });

  return { upserted, reported };
}
