import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { getOrgActivitySettings } from "@/lib/activity/service";
import { getOrgSignalsPolicy } from "@/lib/signals/service";
import { getOrgBillingStatus } from "@/lib/saas-billing/status";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const [settings, signalsPolicy, billing, billingMembers, organization] = await Promise.all([
    getOrgActivitySettings(principal.orgId),
    getOrgSignalsPolicy(principal.orgId),
    getOrgBillingStatus(principal.orgId, principal.role),
    prisma.developer.findMany({
      where: { orgId: principal.orgId, removedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.organization.findUnique({
      where: { id: principal.orgId },
      select: { name: true, color: true },
    }),
  ]);
  const loaded = performance.now();
  return appData(
    {
      orgId: principal.orgId,
      orgName: organization?.name ?? "Workspace",
      orgColor: organization?.color ?? null,
      settings,
      signalsPolicy,
      billing,
      billingMembers,
    },
    { serverTiming: timingHeader({ auth: authenticated - started, data: loaded - authenticated, total: loaded - started }) },
  );
}
