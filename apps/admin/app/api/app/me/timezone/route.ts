import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { applyUserTimeZone } from "@/lib/notifications/preferences";
import { prisma } from "@usejunction/db";

export async function GET(request: NextRequest) {
  const principal = await requireAppPrincipal(request);
  if (principal instanceof NextResponse) return principal;

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { timeZone: true, timeZoneSource: true, timeZoneManual: true },
  });
  return appData({
    timeZone: user?.timeZone ?? "UTC",
    timeZoneSource: user?.timeZoneSource ?? null,
    timeZoneManual: user?.timeZoneManual ?? false,
  });
}

export async function POST(request: NextRequest) {
  const principal = await requireAppPrincipal(request);
  if (principal instanceof NextResponse) return principal;

  const body = (await request.json().catch(() => ({}))) as {
    timeZone?: string;
    source?: "browser" | "agent" | "manual";
    manual?: boolean;
  };
  if (!body.timeZone || typeof body.timeZone !== "string") {
    return appError("BAD_REQUEST", "timeZone is required", 400);
  }
  const source = body.source === "manual" || body.manual ? "manual" : body.source === "agent" ? "agent" : "browser";

  try {
    const result = await applyUserTimeZone({
      userId: principal.userId,
      timeZone: body.timeZone,
      source,
      forceManual: source === "manual",
    });
    return appData(result);
  } catch (error) {
    return appError("BAD_REQUEST", error instanceof Error ? error.message : "Invalid timezone", 400);
  }
}
