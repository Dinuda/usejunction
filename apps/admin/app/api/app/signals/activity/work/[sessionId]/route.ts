import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getWorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  if (principal instanceof NextResponse) return principal;
  const envelope = await getWorkSessionDetail(
    { orgId: principal.orgId, actorId: principal.userId, roles: [principal.role], now: new Date(), timezone: UTC_TIMEZONE },
    (await params).sessionId,
  );
  if (!envelope) return appError("NOT_FOUND", "Work session not found.", 404);
  return appData({ session: envelope.data });
}
