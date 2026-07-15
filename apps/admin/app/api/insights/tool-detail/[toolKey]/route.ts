import { NextRequest, NextResponse } from "next/server";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getToolDetailInsight } from "@/lib/insights/queries/get-tool-detail";
import { requireOrgRole } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ toolKey: string }> },
) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const { toolKey } = await params;
  const rangeParam = req.nextUrl.searchParams.get("range");
  const range =
    rangeParam === "7" || rangeParam === "30" || rangeParam === "90"
      ? (Number(rangeParam) as 7 | 30 | 90)
      : 7;

  try {
    const reportWindow = resolveReportWindow({ range, timezone: UTC_TIMEZONE });
    const envelope = await getToolDetailInsight(
      {
        orgId: auth.orgId,
        actorId: auth.userId,
        roles: [auth.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      { reportWindow, toolKey },
    );
    if (!envelope) return NextResponse.json({ error: "tool not found" }, { status: 404 });
    return NextResponse.json(serializeBigInts(envelope));
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[insights/tool-detail]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
