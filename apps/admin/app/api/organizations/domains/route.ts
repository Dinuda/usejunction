import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { requireOrgRole, audit } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

const schema = z.object({ domain: z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/).max(253) });

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const domains = await prisma.organizationDomain.findMany({
    where: { orgId: auth.orgId },
    select: { id: true, domain: true, verifiedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ domains });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "valid domain required" }, { status: 400 });
  const token = generateOpaqueToken("uj_domain", 24);
  try {
    const domain = await prisma.organizationDomain.create({
      data: { orgId: auth.orgId, domain: parsed.data.domain, verificationHash: hashOpaqueToken(token) },
      select: { id: true, domain: true, createdAt: true },
    });
    await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "domain.created", targetType: "domain", targetId: domain.id });
    return NextResponse.json({
      domain,
      dns: { type: "TXT", name: `_usejunction.${domain.domain}`, value: `usejunction-verification=${token}` },
    }, { status: 201 });
  } catch (error) {
    if (String(error).includes("Unique constraint")) return NextResponse.json({ error: "domain is already registered" }, { status: 409 });
    throw error;
  }
}
