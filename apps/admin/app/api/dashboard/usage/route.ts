import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardUsage } from "@/lib/queries/dashboard/usage";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "30"), 90);
    return NextResponse.json(await getDashboardUsage(auth.orgId, days));
  } catch (e) {
    console.error("[dashboard/usage]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
