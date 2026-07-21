import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { getSentReportPreview } from "@/lib/reports/sent-reports";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const { id } = await context.params;
  const query = request.nextUrl.searchParams;
  const audience =
    principal.role === "user" ? ("you" as const) : parseAudienceScope(query.get("scope"));

  const preview = await getSentReportPreview({
    orgId: principal.orgId,
    deliveryId: id,
    viewerUserId: principal.userId,
    viewerRole: principal.role,
    audience,
  });
  const loaded = performance.now();

  if (!preview) {
    return appError("NOT_FOUND", "Report not found.", 404);
  }

  return appData(preview, {
    serverTiming: timingHeader({
      auth: authenticated - started,
      data: loaded - authenticated,
      total: loaded - started,
    }),
  });
}
