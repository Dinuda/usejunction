import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit } from "@/lib/rbac";

const renameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** Rename the active workspace (owner/admin). */
export async function PATCH(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = renameSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "workspace name required" }, { status: 400 });
  }

  const organization = await prisma.organization.update({
    where: { id: auth.orgId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, slug: true },
  });

  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: "workspace.renamed",
    targetType: "organization",
    targetId: organization.id,
    metadata: { name: organization.name },
  });

  return NextResponse.json({ organization });
}
