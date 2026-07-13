import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getDashboardTools(auth.orgId));
  } catch (e) {
    console.error("[dashboard/tools]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
