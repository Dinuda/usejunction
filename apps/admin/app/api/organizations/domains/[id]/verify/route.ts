import { resolveTxt } from "dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { hashOpaqueToken } from "@/lib/security";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const domain = await prisma.organizationDomain.findFirst({ where: { id, orgId: auth.orgId } });
  if (!domain) return NextResponse.json({ error: "domain not found" }, { status: 404 });
  let records: string[][];
  try {
    records = await resolveTxt(`_usejunction.${domain.domain}`);
  } catch {
    return NextResponse.json({ error: "verification TXT record not found" }, { status: 409 });
  }
  const verified = records.flatMap((record) => [record.join(""), ...record]).some((record) => {
    const value = record.startsWith("usejunction-verification=") ? record.slice("usejunction-verification=".length) : record;
    return hashOpaqueToken(value) === domain.verificationHash;
  });
  if (!verified) return NextResponse.json({ error: "verification TXT record did not match" }, { status: 409 });
  const updated = await prisma.organizationDomain.update({ where: { id }, data: { verifiedAt: new Date() } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "domain.verified", targetType: "domain", targetId: id });
  return NextResponse.json({ id: updated.id, domain: updated.domain, verifiedAt: updated.verifiedAt });
}
