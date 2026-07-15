import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getPublicAppUrl } from "@/lib/connect-command";
import { enforceRateLimit } from "@/lib/rate-limit";
import { constantTimeHashMatch, generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limited = enforceRateLimit(req, "connect-invite-status", {
    limit: 180,
    windowMs: 15 * 60 * 1000,
    identity: token,
  });
  if (limited) return limited;
  const invite = await prisma.connectInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!invite) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pollToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!invite.pollTokenHash || !constantTimeHashMatch(pollToken, invite.pollTokenHash)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (invite.expiresAt <= new Date() && invite.status !== "used") {
    if (invite.status !== "expired") {
      await prisma.connectInvite.update({ where: { id: invite.id }, data: { status: "expired" } });
    }
    return NextResponse.json({ status: "expired" });
  }

  if (invite.status === "used") {
    return NextResponse.json({ status: "used" });
  }

  if (invite.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }

  if (invite.status === "ready") {
    const developer = await prisma.developer.findUnique({
      where: { orgId_email: { orgId: invite.orgId, email: invite.email } },
      select: { id: true, teamId: true },
    });
    if (!developer) {
      return NextResponse.json({ error: "invite is not linked to a developer" }, { status: 409 });
    }

    const enrollmentToken = generateOpaqueToken("uj_enroll", 32);
    const enrollmentTokenHash = hashOpaqueToken(enrollmentToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const consumed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.connectInvite.updateMany({
        where: { id: invite.id, status: "ready", usedAt: null },
        data: {
          status: "used",
          usedAt: new Date(),
          pollTokenHash: null,
          enrollmentTokenHash,
        },
      });
      if (claimed.count !== 1) return false;
      await tx.enrollmentToken.deleteMany({ where: { developerId: developer.id, usedAt: null } });
      await tx.enrollmentToken.create({
        data: {
          orgId: invite.orgId,
          teamId: developer.teamId,
          developerId: developer.id,
          tokenHash: enrollmentTokenHash,
          expiresAt,
        },
      });
      return true;
    });
    if (!consumed) return NextResponse.json({ status: "used" });

    return NextResponse.json({
      status: "ready",
      enrollmentToken,
      controlPlaneUrl: getPublicAppUrl(),
    });
  }

  return NextResponse.json({ status: invite.status === "ready" ? "used" : invite.status });
}
