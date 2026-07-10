import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { requireAdminSession, hashToken, generateEnrollmentToken, getDefaultOrgId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.orgId ?? getDefaultOrgId();
    const teamId = body.teamId ?? null;
    const expiresInHours = body.expiresInHours ?? 72;

    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    await prisma.enrollmentToken.create({
      data: { orgId, teamId, tokenHash, expiresAt },
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
  const auth = await requireAdminSession(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const orgId = getDefaultOrgId();
    const tokens = await prisma.enrollmentToken.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orgId: true,
        teamId: true,
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
