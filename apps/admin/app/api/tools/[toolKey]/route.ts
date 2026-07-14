import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { serializeBigInts } from "@/lib/billing/validation";
import { getToolDetail } from "@/lib/queries/dashboard/tool-detail";

export async function GET(req: NextRequest, { params }: { params: Promise<{ toolKey: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { toolKey } = await params;
  try {
    const detail = await getToolDetail(auth.orgId, toolKey);
    if (!detail) return NextResponse.json({ error: "tool not found" }, { status: 404 });
    return NextResponse.json(serializeBigInts({ tool: detail }));
  } catch (error) {
    console.error("GET /api/tools/[toolKey]", error);
    return NextResponse.json({ error: "could not load tool detail" }, { status: 500 });
  }
}
