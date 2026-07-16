import { prisma } from "@usejunction/db";
import { isDeviceOnline } from "@/lib/devices/presence";
import { canonicalToolKey, findCatalogTool } from "@/lib/tools/catalog";

export type LocalSyncContext = {
  lastSeenAt: string | null;
  lastUsageSyncAt: string | null;
  lastAccountSyncAt: string | null;
  stale: boolean;
  hasLocalEndpoint: boolean;
  needsPlanSync: boolean;
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

export async function getLocalSyncContext(orgId: string, authUserId: string): Promise<LocalSyncContext | null> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId },
    select: {
      devices: {
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
  if (!developer) return null;

  let latestSeen: Date | null = null;
  let latestUsageSync: Date | null = null;
  let latestAccountSync: Date | null = null;

  const allInstallations: Array<{ toolName: string }> = [];
  const allAccounts: Array<{ toolName: string; plan: string | null }> = [];

  for (const device of developer.devices) {
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

  const personalNeedsPlanSync = catalogToolDetectedWithoutPlan({
    installations: allInstallations,
    accounts: allAccounts,
  });
  const orgWideNeedsPlanSync = await orgNeedsPlanSync(orgId);

  return {
    lastSeenAt: latestSeen?.toISOString() ?? null,
    lastUsageSyncAt: latestUsageSync?.toISOString() ?? null,
    lastAccountSyncAt: latestAccountSync?.toISOString() ?? null,
    stale: !developer.devices.some((device) => isDeviceOnline(device.lastSeenAt)),
    hasLocalEndpoint: developer.devices.some((device) => Boolean(device.localEndpoint)),
    needsPlanSync: personalNeedsPlanSync || orgWideNeedsPlanSync,
  };
}
