import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { hashToken, generateEnrollmentToken } from "@/lib/auth";
import { requireOrgRole, rolesFor } from "@/lib/rbac";
import { assertCanEnrollDevice } from "@/lib/saas-billing/status";

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = auth.orgId;
    if (!orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });
    const developerId = String(body.developerId ?? "");
    if (!developerId) return NextResponse.json({ error: "developerId required" }, { status: 400 });
    const developer = await prisma.developer.findFirst({ where: { id: developerId, orgId, removedAt: null } });
    if (!developer) return NextResponse.json({ error: "developer not found" }, { status: 404 });

    const enrollGate = await assertCanEnrollDevice(orgId, developer.id);
    if (!enrollGate.allowed) {
      return NextResponse.json({ error: enrollGate.message }, { status: 403 });
    }

    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.enrollmentToken.create({
      data: { orgId, teamId: developer.teamId, developerId: developer.id, tokenHash, expiresAt },
    });

    return NextResponse.json({
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    console.error("[enrollment-tokens]", e);
    return NextResponse.json({ error: "failed to create token" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = auth.orgId;
    if (!orgId) return NextResponse.json({ error: "organization setup required" }, { status: 409 });
    const tokens = await prisma.enrollmentToken.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orgId: true,
        teamId: true,
        developerId: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ tokens });
  } catch (e) {
    console.error("[enrollment-tokens GET]", e);
    return NextResponse.json({ error: "failed to list tokens" }, { status: 500 });
  }
}
