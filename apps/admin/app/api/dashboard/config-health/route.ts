import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, getDefaultOrgId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();

    const [tools, accounts, quotas] = await Promise.all([
      prisma.toolInstallation.findMany({
        where: { orgId },
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
          device: { select: { hostname: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const issues: Array<{ severity: "warning" | "error"; message: string; context: string }> = [];

    for (const t of tools) {
      if (!t.configured) {
        issues.push({
          severity: "warning",
          message: `${t.toolName} not configured`,
          context: `${t.user?.name ?? "unknown"} / ${t.device?.hostname ?? "unknown"}`,
        });
      }
    }

    for (const a of accounts) {
      if (!a.authPresent) {
        issues.push({
          severity: "error",
          message: `${a.toolName} missing auth`,
          context: `${a.user?.name ?? "unknown"} / ${a.device?.hostname ?? "unknown"}`,
        });
      }
    }

    for (const q of quotas) {
      if ((q.usedPercent ?? 0) > 85) {
        issues.push({
          severity: (q.usedPercent ?? 0) > 95 ? "error" : "warning",
          message: `${q.toolName} quota at ${q.usedPercent?.toFixed(0)}%`,
          context: q.device?.hostname ?? "unknown device",
        });
      }
    }

    return NextResponse.json({
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
      healthScore: tools.length === 0 ? null : Math.round(
        (tools.filter((t) => t.configured).length / tools.length) * 100
      ),
    });
  } catch (e) {
    console.error("[dashboard/config-health]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
