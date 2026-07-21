import { prisma } from "@usejunction/db";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";

export type LocalSyncContext = {
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  hasLocalEndpoint: boolean;
  needsPlanSync: boolean;
  /** Active (non-decommissioned) devices for the current developer. */
  deviceCount: number;
};

function catalogToolDetectedWithoutPlan(input: {
  installations: Array<{ toolName: string }>;
  accounts: Array<{ toolName: string; plan: string | null }>;
}) {
  for (const installation of input.installations) {
    const toolKey = canonicalToolKey(installation.toolName);
    if (!findCatalogTool(toolKey)) continue;
    const account = input.accounts.find((row) => canonicalToolKey(row.toolName) === toolKey);
    if (!account?.plan?.trim()) return true;
  }
  return false;
}

/** Exported for unit tests — catalog tool detected without a plan on that developer. */
export function catalogToolDetectedWithoutPlanForTests(
  input: {
    installations: Array<{ toolName: string }>;
    accounts: Array<{ toolName: string; plan: string | null }>;
  },
) {
  return catalogToolDetectedWithoutPlan(input);
}

export async function orgNeedsPlanSync(orgId: string): Promise<boolean> {
  const [installations, accounts] = await Promise.all([
    prisma.toolInstallation.findMany({
      where: { orgId, detected: true },
      select: { toolName: true, userId: true },
    }),
    prisma.toolAccount.findMany({
      where: { orgId },
      select: { toolName: true, userId: true, plan: true },
    }),
  ]);

  const accountsByDeveloper = new Map<string, Array<{ toolName: string; plan: string | null }>>();
  for (const account of accounts) {
    const list = accountsByDeveloper.get(account.userId) ?? [];
    list.push({ toolName: account.toolName, plan: account.plan });
    accountsByDeveloper.set(account.userId, list);
  }

  return installations.some((installation) => {
    const toolKey = canonicalToolKey(installation.toolName);
    if (!findCatalogTool(toolKey)) return false;
    const devAccounts = accountsByDeveloper.get(installation.userId) ?? [];
    return catalogToolDetectedWithoutPlan({
      installations: [{ toolName: installation.toolName }],
      accounts: devAccounts,
    });
  });
}

async function loadDeveloperSyncDevices(orgId: string, authUserId: string) {
  return prisma.developer.findFirst({
    where: { orgId, authUserId },
    select: {
      devices: {
        where: { decommissionedAt: null },
        orderBy: { lastSeenAt: "desc" },
        select: {
          lastSeenAt: true,
          lastUsageSyncAt: true,
          lastAccountSyncAt: true,
          localEndpoint: true,
          toolInstallations: { where: { detected: true }, select: { toolName: true } },
          toolAccounts: { select: { toolName: true, plan: true } },
        },
      },
    },
  });
}

function summarizeDeveloperDevices(
  devices: Array<{
    lastSeenAt: Date;
    lastUsageSyncAt: Date | null;
    lastAccountSyncAt: Date | null;
    localEndpoint: string | null;
    toolInstallations: Array<{ toolName: string }>;
    toolAccounts: Array<{ toolName: string; plan: string | null }>;
  }>,
) {
  let latestSeen: Date | null = null;
  let latestUsageSync: Date | null = null;
  let latestAccountSync: Date | null = null;
  const allInstallations: Array<{ toolName: string }> = [];
  const allAccounts: Array<{ toolName: string; plan: string | null }> = [];

  for (const device of devices) {
    if (!latestSeen || device.lastSeenAt > latestSeen) latestSeen = device.lastSeenAt;
    if (device.lastUsageSyncAt && (!latestUsageSync || device.lastUsageSyncAt > latestUsageSync)) {
      latestUsageSync = device.lastUsageSyncAt;
    }
    if (device.lastAccountSyncAt && (!latestAccountSync || device.lastAccountSyncAt > latestAccountSync)) {
      latestAccountSync = device.lastAccountSyncAt;
    }
    allInstallations.push(...device.toolInstallations);
    allAccounts.push(...device.toolAccounts);
  }

  return {
    lastSeenAt: latestSeen?.toISOString() ?? null,
    lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
    lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
    hasLocalEndpoint: devices.some((device) => Boolean(device.localEndpoint)),
    personalNeedsPlanSync: catalogToolDetectedWithoutPlan({
      installations: allInstallations,
      accounts: allAccounts,
    }),
  };
}

/**
 * Sync panel context for org tools / dashboard shells.
 * Skips the org-wide plan-sync scan — only personal device timestamps matter for the panel.
 */
export async function getLocalSyncPanelContext(
  orgId: string,
  authUserId: string,
): Promise<LocalSyncContext | null> {
  const developer = await loadDeveloperSyncDevices(orgId, authUserId);
  if (!developer) return null;
  const summary = summarizeDeveloperDevices(developer.devices);
  return {
    lastSeenAt: summary.lastSeenAt,
    lastUsageSyncAt: summary.lastUsageSyncAt,
    lastAccountSyncAt: summary.lastAccountSyncAt,
    hasLocalEndpoint: summary.hasLocalEndpoint,
    needsPlanSync: summary.personalNeedsPlanSync,
    deviceCount: developer.devices.length,
  };
}

export async function getLocalSyncContext(orgId: string, authUserId: string): Promise<LocalSyncContext | null> {
  const developer = await loadDeveloperSyncDevices(orgId, authUserId);
  if (!developer) return null;
  const summary = summarizeDeveloperDevices(developer.devices);
  const orgWideNeedsPlanSync = await orgNeedsPlanSync(orgId);

  return {
    lastSeenAt: summary.lastSeenAt,
    lastUsageSyncAt: summary.lastUsageSyncAt,
    lastAccountSyncAt: summary.lastAccountSyncAt,
    hasLocalEndpoint: summary.hasLocalEndpoint,
    needsPlanSync: summary.personalNeedsPlanSync || orgWideNeedsPlanSync,
    deviceCount: developer.devices.length,
  };
}
