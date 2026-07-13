import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { requireOrgRole } from "@/lib/rbac";

const schema = z.object({ tools: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9_-]+$/).max(48)).max(50) });

export async function PUT(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin", "developer"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "tools array required" }, { status: 400 });
  const developer = await prisma.developer.findFirst({ where: { orgId: auth.orgId, authUserId: auth.userId } });
  if (!developer) return NextResponse.json({ error: "developer profile required" }, { status: 409 });
  const selected = [...new Set(parsed.data.tools)];
  await prisma.$transaction([
    prisma.developerToolClaim.updateMany({ where: { developerId: developer.id, source: "employee_reported" }, data: { enabled: false, observedAt: new Date() } }),
    ...selected.map((toolName) => prisma.developerToolClaim.upsert({
      where: { developerId_toolName_source: { developerId: developer.id, toolName, source: "employee_reported" } },
      update: { enabled: true, observedAt: new Date() },
      create: { orgId: auth.orgId, developerId: developer.id, toolName, source: "employee_reported" },
    })),
  ]);
  return NextResponse.json({ tools: selected });
}
