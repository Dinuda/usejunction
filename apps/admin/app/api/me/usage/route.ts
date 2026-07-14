import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { aggregateMetrics } from "@/lib/metrics/aggregate";
import { usageWindowDays } from "@/lib/metrics/date-range";
import { requireOrgRole } from "@/lib/rbac";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = querySchema.safeParse({ days: req.nextUrl.searchParams.get("days") ?? 30 });
  if (!parsed.success) return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  const developer = await prisma.developer.findFirst({ where: { orgId: auth.orgId, authUserId: auth.userId }, select: { id: true } });
  if (!developer) return NextResponse.json({ error: "developer profile required" }, { status: 409 });
  const window = usageWindowDays(parsed.data.days);
  const data = await aggregateMetrics({ orgId: auth.orgId, developerId: developer.id, from: window.from, to: window.to, groupBy: "day", includeAllSources: false });
  return NextResponse.json({ from: window.from, to: window.to, data });
}
