import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveReportWindow, UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { serializeBigInts } from "@/lib/billing/validation";
import { getUsageDetail } from "@/lib/insights/queries/get-usage-detail";
import { requireOrgRole } from "@/lib/rbac";
import { prisma } from "@usejunction/db";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = querySchema.safeParse({ days: req.nextUrl.searchParams.get("days") ?? 30 });
  if (!parsed.success) return NextResponse.json({ error: "invalid date range" }, { status: 400 });

  const developer = await prisma.developer.findFirst({
    where: { orgId: auth.orgId, authUserId: auth.userId },
    select: { id: true },
  });
  if (!developer) return NextResponse.json({ error: "developer profile required" }, { status: 409 });

  const days = parsed.data.days;
  const range = days <= 7 ? 7 : days <= 30 ? 30 : 90;
  const reportWindow = resolveReportWindow({ range, timezone: UTC_TIMEZONE });
  const envelope = await getUsageDetail(
    {
      orgId: auth.orgId,
      actorId: auth.userId,
      roles: [auth.role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    { reportWindow, developerId: developer.id },
  );

  return NextResponse.json(
    serializeBigInts({
      from: reportWindow.from,
      to: reportWindow.to,
      data: envelope.data.byDay,
      detail: envelope.data,
    }),
  );
}
