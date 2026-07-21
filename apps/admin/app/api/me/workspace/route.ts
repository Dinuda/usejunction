import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth, updateSession } from "@/auth";
import { prisma } from "@usejunction/db";
import { ACTIVE_ORG_COOKIE } from "@/lib/require-organization";
import { browserMutationGuard, limitedJson } from "@/lib/security/http";

const schema = z.object({
  orgId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const rejected = browserMutationGuard(req);
  if (rejected) return rejected;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await limitedJson(req, 1024);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId: parsed.data.orgId } },
    select: { orgId: true, role: true, organization: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "not a member of that workspace" }, { status: 403 });

  const updated = await updateSession({ user: { orgId: membership.orgId } });
  if (updated?.user?.orgId !== membership.orgId) {
    return NextResponse.json({ error: "session update failed" }, { status: 500 });
  }

  const response = NextResponse.json({
    orgId: membership.orgId,
    role: membership.role,
    name: membership.organization.name,
  });
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  return response;
}
