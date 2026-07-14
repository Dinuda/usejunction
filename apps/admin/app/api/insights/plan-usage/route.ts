import { NextRequest, NextResponse } from "next/server";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getPlanUsage } from "@/lib/insights/queries/get-plan-usage";
import { requireOrgRole } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const rangeParam = params.get("range");
  const range =
    rangeParam === "7" || rangeParam === "30" || rangeParam === "90"
      ? (Number(rangeParam) as 7 | 30 | 90)
      : undefined;
  const from = params.get("from");
  const to = params.get("to");
  const timezone = params.get("timezone") ?? UTC_TIMEZONE;
  const developerId = params.get("developerId") ?? undefined;

  try {
    const reportWindow = resolveReportWindow({
      range: from && to ? undefined : range ?? 30,
      from: from ?? undefined,
      to: to ?? undefined,
      timezone,
    });
    const envelope = await getPlanUsage(
      {
        orgId: auth.orgId,
        actorId: auth.userId,
        roles: [auth.role],
        now: new Date(),
        timezone: reportWindow.timezone,
      },
      { reportWindow, developerId },
    );
    return NextResponse.json(serializeBigInts(envelope));
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[insights/plan-usage]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
