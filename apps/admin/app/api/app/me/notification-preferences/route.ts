import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { loadNotificationPreferences } from "@/lib/app-pages/settings";
import { applyUserTimeZone, getOrCreateNotificationPrefs } from "@/lib/notifications/preferences";

export async function GET(request: NextRequest) {
  const principal = await requireAppPrincipal(request);
  if (principal instanceof NextResponse) return principal;
  return appData(await loadNotificationPreferences(principal));
}

export async function PATCH(request: NextRequest) {
  const principal = await requireAppPrincipal(request);
  if (principal instanceof NextResponse) return principal;

  const body = (await request.json().catch(() => ({}))) as {
    timeZone?: string;
    dailyPersonalEnabled?: boolean;
    dailyOrgEnabled?: boolean;
  };

  if (typeof body.timeZone === "string" && body.timeZone.trim()) {
    try {
      await applyUserTimeZone({
        userId: principal.userId,
        timeZone: body.timeZone.trim(),
        source: "manual",
        forceManual: true,
      });
    } catch (error) {
      return appError("BAD_REQUEST", error instanceof Error ? error.message : "Invalid timezone", 400);
    }
  }

  const prefs = await getOrCreateNotificationPrefs(principal.userId, principal.orgId);
  const updated = await prisma.userNotificationPreference.update({
    where: { id: prefs.id },
    data: {
      ...(typeof body.dailyPersonalEnabled === "boolean"
        ? { dailyPersonalEnabled: body.dailyPersonalEnabled }
        : {}),
      ...(typeof body.dailyOrgEnabled === "boolean" ? { dailyOrgEnabled: body.dailyOrgEnabled } : {}),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { timeZone: true, timeZoneSource: true, timeZoneManual: true },
  });

  return appData({
    timeZone: user?.timeZone ?? "UTC",
    timeZoneSource: user?.timeZoneSource ?? null,
    timeZoneManual: Boolean(user?.timeZoneManual),
    role: principal.role,
    dailyPersonalEnabled: updated.dailyPersonalEnabled,
    dailyOrgEnabled: updated.dailyOrgEnabled,
  });
}
