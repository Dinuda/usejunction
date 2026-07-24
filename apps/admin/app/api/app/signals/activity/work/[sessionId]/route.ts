import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError } from "@/lib/api/app-response";
import { loadSignalsWorkDetailPage } from "@/lib/app-pages/signals-work-detail";
import { rolesFor } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const principal = await requireAppPrincipal(request, rolesFor("org_overview"));
  if (principal instanceof NextResponse) return principal;
  const data = await loadSignalsWorkDetailPage(principal, (await params).sessionId);
  if (!data) return appError("NOT_FOUND", "Work session not found.", 404);
  return appData(data);
}
