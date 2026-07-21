import { NextRequest, NextResponse } from "next/server";
import { requireAppPrincipal } from "@/lib/api/app-auth";
import { appData, timingHeader } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { listSentReports, type SentReportKindFilter } from "@/lib/reports/sent-reports";

function parseKindFilter(value: string | null): SentReportKindFilter {
  if (value === "personal" || value === "org") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  const started = performance.now();
  const principal = await requireAppPrincipal(request);
  const authenticated = performance.now();
  if (principal instanceof NextResponse) return principal;

  const query = request.nextUrl.searchParams;
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const audience =
    principal.role === "user" ? ("you" as const) : parseAudienceScope(query.get("scope"));
  const limit = Math.min(Math.max(Number(query.get("limit") ?? "5"), 1), 50);
  const offset = Math.max(Number(query.get("offset") ?? "0"), 0);
  const kind = parseKindFilter(query.get("kind"));

  const result = await listSentReports({
    orgId: principal.orgId,
    viewerUserId: principal.userId,
    viewerRole: principal.role,
    audience,
    kind,
    limit,
    offset,
  });
  const loaded = performance.now();

  return appData(
    {
      audience,
      canSwitchAudience,
      items: result.items,
      total: result.total,
      limit,
      offset,
    },
    {
      serverTiming: timingHeader({
        auth: authenticated - started,
        data: loaded - authenticated,
        total: loaded - started,
      }),
    },
  );
}
