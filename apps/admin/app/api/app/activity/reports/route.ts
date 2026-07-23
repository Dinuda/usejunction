import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { loadActivityReportsPage } from "@/lib/app-pages/activity-reports";

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const query = request.nextUrl.searchParams;
  const data = await loadActivityReportsPage(principal, {
    scope: query.get("scope"),
    limit: query.get("limit"),
    offset: query.get("offset"),
    kind: query.get("kind"),
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
