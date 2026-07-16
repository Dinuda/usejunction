import { NextRequest, NextResponse } from "next/server";
import { getAgentUpdateCoverage } from "@/lib/agent-updates";
import { requireOrgRole } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ version: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { version } = await params;
  const coverage = await getAgentUpdateCoverage(auth.orgId, version);
  if (!coverage) return NextResponse.json({ error: "release not found" }, { status: 404 });
  return NextResponse.json(coverage);
}
