import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { parseAudienceScope, type AudienceScope } from "@/lib/audience-scope";
import {
  getDailyReportPayload,
  type DailyReportKind,
  type DailyReportPeriod,
} from "@/lib/reports/daily-report";

/** Map audience scope (+ legacy kind) to the report builder kind. */
function resolveReportKind(input: {
  role: string;
  scopeParam: string | null;
  kindParam: string | null;
}): { kind: DailyReportKind; scope: AudienceScope; canSwitchAudience: boolean } {
  const canSwitchAudience = input.role === "owner" || input.role === "admin";

  // Role user is always You / personal.
  if (input.role === "user") {
    return { kind: "personal", scope: "you", canSwitchAudience: false };
  }

  // Prefer scope=; fall back to legacy kind= for old email links.
  let scope: AudienceScope;
  if (input.scopeParam === "you" || input.scopeParam === "team") {
    scope = parseAudienceScope(input.scopeParam);
  } else if (input.kindParam === "personal") {
    scope = "you";
  } else if (input.kindParam === "org") {
    scope = "team";
  } else {
    scope = canSwitchAudience ? "team" : "you";
  }

  if (!canSwitchAudience) {
    return { kind: "personal", scope: "you", canSwitchAudience: false };
  }

  return {
    kind: scope === "you" ? "personal" : "org",
    scope,
    canSwitchAudience: true,
  };
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  if (principal instanceof NextResponse) return principal;
  const authenticated = performance.now();

  const query = request.nextUrl.searchParams;
  const { kind, scope, canSwitchAudience } = resolveReportKind({
    role: principal.role,
    scopeParam: query.get("scope"),
    kindParam: query.get("kind"),
  });

  if (kind === "org" && !canSwitchAudience) {
    return appError("FORBIDDEN", "Team reports are limited to owners and admins.", 403);
  }

  const localDate = query.get("date");
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { timeZone: true },
  });
  const developer = await prisma.developer.findFirst({
    where: { orgId: principal.orgId, authUserId: principal.userId, removedAt: null },
    select: { id: true },
  });

  if (kind === "personal" && !developer) {
    return appError("NOT_FOUND", "No developer profile linked to this account.", 404);
  }

  const periodParam = query.get("period");
  const period: DailyReportPeriod | undefined =
    kind === "org" && periodParam === "week" ? "week" : kind === "org" && periodParam === "day" ? "day" : undefined;

  const report = await getDailyReportPayload({
    orgId: principal.orgId,
    kind,
    developerId: developer?.id,
    timeZone: user?.timeZone,
    localDate,
    period,
  });
  const loaded = performance.now();
  return appData(
    { ...report, scope, canSwitchAudience },
    {
      serverTiming: timingHeader({
        auth: authenticated - started,
        data: loaded - authenticated,
        total: loaded - started,
      }),
    },
  );
}
