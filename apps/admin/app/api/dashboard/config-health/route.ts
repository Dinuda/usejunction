import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardConfigHealth } from "@/lib/queries/dashboard/config-health";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getDashboardConfigHealth(auth.orgId));
  } catch (e) {
    console.error("[dashboard/config-health]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
