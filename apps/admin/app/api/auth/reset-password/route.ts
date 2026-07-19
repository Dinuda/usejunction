import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@usejunction/db";
import { hashActionToken } from "@/lib/auth-actions";
import { limitedJson } from "@/lib/security/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const MAX_PASSWORD_BYTES = 256;

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { key: "auth-reset-password", limit: 8, windowSeconds: 60 });
  if (limited !== true) return limited;
  const parsedBody = await limitedJson(request, 16 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token || password.length < 12 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES || password !== body.confirmPassword) return NextResponse.json({ error: "Enter matching passwords of at least 12 characters." }, { status: 400 });
  const action = await prisma.authActionToken.findFirst({ where: { tokenHash: hashActionToken(token), type: "password_reset", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!action) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  await prisma.$transaction([
    prisma.user.update({ where: { id: action.userId }, data: { passwordHash: await hash(password, 12), emailVerified: new Date() } }),
    prisma.authActionToken.update({ where: { id: action.id }, data: { consumedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
