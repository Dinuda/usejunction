import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { parseAudienceScope } from "@/lib/audience-scope";
import { listSentReports, type SentReportKindFilter } from "@/lib/reports/sent-reports";

function parseKindFilter(value: string | null | undefined): SentReportKindFilter {
  if (value === "personal" || value === "org") return value;
  return "all";
}

export type ActivityReportsSearch = {
  scope?: string | null;
  limit?: string | null;
  offset?: string | null;
  kind?: string | null;
};

export async function loadActivityReportsPage(principal: AppPrincipal, search: ActivityReportsSearch = {}) {
  const canSwitchAudience = principal.role === "owner" || principal.role === "admin";
  const audience =
    principal.role === "user" ? ("you" as const) : parseAudienceScope(search.scope ?? null);
  const limit = Math.min(Math.max(Number(search.limit ?? "5"), 1), 50);
  const offset = Math.max(Number(search.offset ?? "0"), 0);
  const kind = parseKindFilter(search.kind);

  const result = await listSentReports({
    orgId: principal.orgId,
    viewerUserId: principal.userId,
    viewerRole: principal.role,
    audience,
    kind,
    limit,
    offset,
  });

  return jsonSafe({
    audience,
    canSwitchAudience,
    items: result.items,
    total: result.total,
    limit,
    offset,
  });
}
