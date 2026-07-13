import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { requireOrgRole } from "@/lib/rbac";
import { ACTIVE_ORG_COOKIE, activeOrgCookieOptions } from "@/lib/require-organization";

const schema = z.object({
  orgId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: auth.userId, orgId: parsed.data.orgId } },
    select: { orgId: true, role: true, organization: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "not a member of that workspace" }, { status: 403 });

  const response = NextResponse.json({
    orgId: membership.orgId,
    role: membership.role,
    name: membership.organization.name,
  });
  response.cookies.set(ACTIVE_ORG_COOKIE, membership.orgId, activeOrgCookieOptions());
  return response;
}
