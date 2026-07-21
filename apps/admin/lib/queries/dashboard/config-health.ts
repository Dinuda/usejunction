import { prisma } from "@usejunction/db";
import { toolDisplayName } from "@/lib/tools/catalog";

export interface ConfigHealthIssue {
  severity: "warning" | "error";
  message: string;
  context: string;
}

export function formatUserDeviceContext(
  user: { name: string } | null | undefined,
  device: { hostname: string } | null | undefined,
): string {
  const name = user?.name?.trim();
  const hostname = device?.hostname?.trim();
  if (name && hostname) return `${name} (${hostname})`;
  if (name) return name;
  if (hostname) return hostname;
  return "Unknown";
}

export interface DashboardConfigHealthData {
  tools: Array<{
    id: string;
    toolName: string;
    detected: boolean;
    configured: boolean;
    version: string | null;
    lastCheckedAt: Date | null;
    user: { name: string; email: string } | null;
    device: { hostname: string } | null;
  }>;
  accounts: Array<{
    id: string;
    toolName: string;
    email: string | null;
    plan: string | null;
    loginMethod: string | null;
    authPresent: boolean;
    user: { name: string; email: string } | null;
    device: { hostname: string } | null;
  }>;
  quotas: Array<{
    id: string;
    toolName: string;
    windowType: string;
    usedPercent: number | null;
    creditsRemaining: number | null;
    resetAt: Date | null;
    updatedAt: Date;
    device: { hostname: string } | null;
  }>;
  issues: ConfigHealthIssue[];
  healthScore: number | null;
}

export async function getDashboardConfigHealth(orgId: string): Promise<DashboardConfigHealthData> {
  const [tools, accounts, quotas] = await Promise.all([
    prisma.toolInstallation.findMany({
      where: { orgId, detected: true },
      include: {
        user: { select: { name: true, email: true } },
        device: { select: { hostname: true } },
      },
      orderBy: { lastCheckedAt: "desc" },
    }),
    prisma.toolAccount.findMany({
      where: { orgId },
      include: {
        user: { select: { name: true, email: true } },
        device: { select: { hostname: true } },
      },
    }),
    prisma.quotaSnapshot.findMany({
      where: { orgId },
      include: {
        device: {
          select: {
            hostname: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const issues: ConfigHealthIssue[] = [];

  // Only surface actionable quota pressure — never "tool not configured" noise
  // for tools the user simply hasn't installed.
  for (const q of quotas) {
    if ((q.usedPercent ?? 0) > 85) {
      issues.push({
        severity: (q.usedPercent ?? 0) > 95 ? "error" : "warning",
        message: `${toolDisplayName(q.toolName)} quota at ${q.usedPercent?.toFixed(0)}%`,
        context: formatUserDeviceContext(q.device?.user, q.device),
      });
    }
  }

  const detectedTools = tools.filter((t) => t.detected);
  return {
    tools: tools.map((t) => ({
      id: t.id,
      toolName: t.toolName,
      detected: t.detected,
      configured: t.configured,
      version: t.version,
      lastCheckedAt: t.lastCheckedAt,
      user: t.user,
      device: t.device,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      toolName: a.toolName,
      email: a.email,
      plan: a.plan,
      loginMethod: a.loginMethod,
      authPresent: a.authPresent,
      user: a.user,
      device: a.device,
    })),
    quotas: quotas.map((q) => ({
      id: q.id,
      toolName: q.toolName,
      windowType: q.windowType,
      usedPercent: q.usedPercent,
      creditsRemaining: q.creditsRemaining,
      resetAt: q.resetAt,
      updatedAt: q.updatedAt,
      device: q.device,
    })),
    issues,
    healthScore:
      detectedTools.length === 0
        ? null
        : Math.round((detectedTools.filter((t) => t.configured).length / detectedTools.length) * 100),
  };
}
