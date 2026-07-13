import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardOverview } from "@/lib/queries/dashboard/overview";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getDashboardOverview(auth.orgId));
  } catch (e) {
    console.error("[dashboard/overview]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
