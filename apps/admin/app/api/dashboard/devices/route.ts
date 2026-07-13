import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getDashboardDevices(auth.orgId));
  } catch (e) {
    console.error("[dashboard/devices]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
