import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { validateConnection } from "@/lib/integrations/sync";
import { requireOrgRole, rolesFor } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const connection = await prisma.providerConnection.findFirst({ where: { id, orgId: auth.orgId } });
  if (!connection) return NextResponse.json({ error: "integration not found" }, { status: 404 });
  try {
    const result = await validateConnection(connection);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[integrations/test]", error);
    return NextResponse.json({ ok: false, error: "provider credential validation failed" }, { status: 422 });
  }
}
