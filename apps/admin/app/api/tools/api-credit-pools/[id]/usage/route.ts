import { NextRequest, NextResponse } from "next/server";
import { readApiCreditUsage } from "@/lib/api-credits";
import { creditUsageGroupSchema } from "@/lib/api-credits/validation";
import { requireOrgRole, rolesFor } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = creditUsageGroupSchema.safeParse(req.nextUrl.searchParams.get("groupBy") ?? "developer");
  if (!parsed.success) return NextResponse.json({ error: "invalid groupBy" }, { status: 400 });
  const { id } = await params;
  const result = await readApiCreditUsage(auth.orgId, id, parsed.data);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "credit pool not found" }, { status: 404 });
}
