import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { hashOpaqueToken } from "@/lib/security";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await prisma.teamInviteLink.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      organization: { select: { name: true, slug: true } },
      allowlist: { select: { email: true } },
    },
  });

  if (!link || !link.enabled) {
    return NextResponse.json({ error: "invite link not found" }, { status: 404 });
  }
  if (link.expiresAt && link.expiresAt <= new Date()) {
    return NextResponse.json({
      status: "expired",
      organization: link.organization,
    });
  }

  return NextResponse.json({
    status: "active",
    organization: link.organization,
    allowlistCount: link.allowlist.length,
  });
}
