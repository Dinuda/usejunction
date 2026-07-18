import { NextRequest, NextResponse } from "next/server";
import { getWorkExtractionReadiness } from "@/lib/agent-updates";
import { requireOrgRole, rolesFor } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const readiness = await getWorkExtractionReadiness(auth.orgId);
  return NextResponse.json({ readiness });
}
