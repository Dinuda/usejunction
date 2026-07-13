import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardLocalModels } from "@/lib/queries/dashboard/local-models";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getDashboardLocalModels(auth.orgId));
  } catch (e) {
    console.error("[dashboard/local-models]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
