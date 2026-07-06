import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { generateEnrollmentToken, hashToken, getDefaultOrgId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = body.orgId || getDefaultOrgId();
    const teamId = body.teamId || "seed-team";
    const expiresInDays = body.expiresInDays || 30;

    const rawToken = generateEnrollmentToken();
    const tokenHash = hashToken(rawToken);

    await prisma.enrollmentToken.create({
      data: {
        orgId,
        teamId,
        tokenHash,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      token: rawToken,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      installCommand: `curl -fsSL https://usejunction.dev/install.sh | sh -s -- --enroll-token ${rawToken}`,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to create token" }, { status: 500 });
  }
}
