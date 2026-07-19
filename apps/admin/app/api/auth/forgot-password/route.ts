import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { appUrl, createAuthActionToken, sendAuthEmail } from "@/lib/auth-actions";
import { limitedJson } from "@/lib/security/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { key: "auth-forgot-password", limit: 8, windowSeconds: 60 });
  if (limited !== true) return limited;
  const parsedBody = await limitedJson(request, 16 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await createAuthActionToken(user.id, "password_reset", 60 * 60 * 1000);
    await sendAuthEmail({ to: email, subject: "Reset your UseJunction password", url: appUrl(`/reset-password?token=${token}`) });
  }
  return NextResponse.json({ ok: true });
}
