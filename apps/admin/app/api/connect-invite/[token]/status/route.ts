import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getPublicAppUrl } from "@/lib/connect-command";
import { hashOpaqueToken } from "@/lib/security";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.connectInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!invite) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (invite.expiresAt <= new Date() && invite.status !== "used" && invite.status !== "ready") {
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

  if (invite.status === "ready" && invite.enrollmentTokenReveal) {
    const enrollmentToken = invite.enrollmentTokenReveal;
    const claimed = await prisma.connectInvite.updateMany({
      where: { id: invite.id, status: "ready", enrollmentTokenReveal: { not: null } },
      data: { enrollmentTokenReveal: null, status: "used", usedAt: new Date() },
    });
    if (claimed.count !== 1) return NextResponse.json({ status: "used" });
    return NextResponse.json({
      status: "ready",
      enrollmentToken,
      controlPlaneUrl: getPublicAppUrl(),
    });
  }

  return NextResponse.json({ status: invite.status === "ready" ? "used" : invite.status });
}
