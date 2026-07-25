import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { loadTeamMemberHubPage, loadTeamMemberWorkPage } from "@/lib/app-pages/team-member";
import { rolesFor } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ developerId: string }> }) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request, rolesFor("org_overview"));
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const developerId = (await params).developerId;
  const query = request.nextUrl.searchParams;
  const search = {
    view: query.get("view"),
    days: query.get("days"),
    from: query.get("from"),
    to: query.get("to"),
  };
  const slice = query.get("slice");

  if (slice === "work") {
    const limit = Number(query.get("limit") ?? "4");
    const data = await loadTeamMemberWorkPage(principal, developerId, {
      ...search,
      limit: Number.isFinite(limit) ? limit : 4,
    });
    const loaded = performance.now();
    return appData(data, {
      serverTiming: timingHeader({
        auth: authenticated - started,
        data: loaded - authenticated,
        total: loaded - started,
      }),
    });
  }

  const data = await loadTeamMemberHubPage(principal, developerId, search);
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
