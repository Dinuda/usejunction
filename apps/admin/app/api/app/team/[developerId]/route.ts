import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { loadTeamMemberPage } from "@/lib/app-pages/team-member";

export async function GET(request: NextRequest, { params }: { params: Promise<{ developerId: string }> }) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, ["owner", "admin"]);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const developerId = (await params).developerId;
  const query = request.nextUrl.searchParams;
  const data = await loadTeamMemberPage(principal, developerId, {
    section: query.get("section"),
    view: query.get("view"),
    days: query.get("days"),
    from: query.get("from"),
    to: query.get("to"),
  });
  if (!data) return appError("NOT_FOUND", "Team member not found.", 404);
  const loaded = performance.now();

  return appData(data, {
    serverTiming: timingHeader({
      auth: authenticated - started,
      data: loaded - authenticated,
      total: loaded - started,
    }),
  });
}
