import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { appUrl, createAuthActionToken, sendAuthEmail } from "@/lib/auth-actions";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const limited = enforceRateLimit(request, "auth-forgot-password", {
    limit: 3,
    windowMs: 30 * 60 * 1000,
    identity: email,
  });
  if (limited) return limited;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createAuthActionToken(user.id, "password_reset", 60 * 60 * 1000);
    await sendAuthEmail({ to: email, subject: "Reset your UseJunction password", url: appUrl(`/reset-password?token=${token}`) });
  }
  return NextResponse.json({ ok: true });
}
