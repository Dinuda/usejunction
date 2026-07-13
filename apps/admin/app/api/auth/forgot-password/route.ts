import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { appUrl, createAuthActionToken, sendAuthEmail } from "@/lib/auth-actions";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createAuthActionToken(user.id, "password_reset", 60 * 60 * 1000);
    await sendAuthEmail({ to: email, subject: "Reset your UseJunction password", url: appUrl(`/reset-password?token=${token}`) });
  }
  return NextResponse.json({ ok: true });
}
