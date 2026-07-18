import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { WORKSPACE_COLORS } from "@/lib/workspace-colors";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: z.enum(WORKSPACE_COLORS).optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: "name or color required",
  });

/** Update the active workspace name/color (owner/admin). */
export async function PATCH(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "name or color required" }, { status: 400 });
  }

  const organization = await prisma.organization.update({
    where: { id: auth.orgId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
    },
    select: { id: true, name: true, slug: true, color: true },
  });

  await audit({
    orgId: auth.orgId,
    actorType: "user",
    actorId: auth.userId,
    action: parsed.data.name !== undefined ? "workspace.renamed" : "workspace.updated",
    targetType: "organization",
    targetId: organization.id,
    metadata: { name: organization.name, color: organization.color },
  });

  return NextResponse.json({ organization });
}
