import { NextRequest, NextResponse } from "next/server";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import {
  getOrgOverview,
  overviewInputFromRange,
} from "@/lib/insights/queries/get-org-overview";
import { requireOrgRole } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const rangeParam = req.nextUrl.searchParams.get("range");
  const range =
    rangeParam === "7" || rangeParam === "30" || rangeParam === "90"
      ? (Number(rangeParam) as 7 | 30 | 90)
      : 30;

  try {
    const envelope = await getOrgOverview(
      {
        orgId: auth.orgId,
        actorId: auth.userId,
        roles: [auth.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      overviewInputFromRange(range),
    );
    return NextResponse.json(serializeBigInts(envelope));
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[insights/overview]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
