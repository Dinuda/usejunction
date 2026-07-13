import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getDashboardRequests } from "@/lib/queries/dashboard/requests";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = req.nextUrl;
    const data = await getDashboardRequests(auth.orgId, {
      limit: parseInt(searchParams.get("limit") ?? "50"),
      cursor: searchParams.get("cursor") ?? undefined,
      toolName: searchParams.get("tool") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("[dashboard/requests]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
