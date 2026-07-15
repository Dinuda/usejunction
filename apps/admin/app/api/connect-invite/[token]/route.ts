import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getPublicAppUrl } from "@/lib/connect-command";
import { hashOpaqueToken } from "@/lib/security";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.connectInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { organization: { select: { name: true, slug: true } } },
  });
  if (!invite) return NextResponse.json({ error: "connect invite not found" }, { status: 404 });

  if (invite.expiresAt <= new Date() && invite.status === "pending") {
    await prisma.connectInvite.update({ where: { id: invite.id }, data: { status: "expired" } });
    return NextResponse.json({
      status: "expired",
      email: maskEmail(invite.email),
      organization: invite.organization,
    });
  }

  return NextResponse.json({
    status: invite.status,
    emailMasked: maskEmail(invite.email),
    organization: invite.organization,
    expiresAt: invite.expiresAt.toISOString(),
  });
}
