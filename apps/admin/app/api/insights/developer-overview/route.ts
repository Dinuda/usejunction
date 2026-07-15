import { NextRequest, NextResponse } from "next/server";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getDeveloperOverview } from "@/lib/insights/queries/get-developer-overview";
import { requireOrgRole } from "@/lib/rbac";
import { prisma } from "@usejunction/db";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const rangeParam = params.get("range");
  const range =
    rangeParam === "7" || rangeParam === "30" || rangeParam === "90"
      ? (Number(rangeParam) as 7 | 30 | 90)
      : 30;
  let developerId = params.get("developerId") ?? undefined;

  try {
    if (!developerId) {
      const self = await prisma.developer.findFirst({
        where: { orgId: auth.orgId, authUserId: auth.userId },
        select: { id: true },
      });
      if (!self) {
        return NextResponse.json({ error: "developer profile required" }, { status: 409 });
      }
      developerId = self.id;
    }

    const reportWindow = resolveReportWindow({ range, timezone: UTC_TIMEZONE });
    const envelope = await getDeveloperOverview(
      {
        orgId: auth.orgId,
        actorId: auth.userId,
        roles: [auth.role],
        now: new Date(),
        timezone: UTC_TIMEZONE,
      },
      { reportWindow, developerId, role: auth.role },
    );
    return NextResponse.json(serializeBigInts(envelope));
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "developer profile required") {
      return NextResponse.json({ error: "developer profile required" }, { status: 409 });
    }
    console.error("[insights/developer-overview]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
