import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { getMeOverview } from "@/lib/queries/me/overview";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json(await getMeOverview(auth.orgId, auth.userId, auth.role));
  } catch (e) {
    if (e instanceof Error && e.message === "developer profile required") {
      return NextResponse.json({ error: "developer profile required" }, { status: 409 });
    }
    console.error("[me/overview]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
