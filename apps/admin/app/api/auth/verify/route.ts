import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { hashActionToken, safeAuthNextPath } from "@/lib/auth-actions";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const next = safeAuthNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");
  if (!token) return NextResponse.redirect(new URL("/login?error=invalid_verification", request.url));
  const action = await prisma.authActionToken.findFirst({
    where: {
      tokenHash: hashActionToken(token),
      type: "email_verification",
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!action) return NextResponse.redirect(new URL("/login?error=expired_verification", request.url));
  await prisma.$transaction([
    prisma.user.update({ where: { id: action.userId }, data: { emailVerified: new Date() } }),
    prisma.authActionToken.update({ where: { id: action.id }, data: { consumedAt: new Date() } }),
  ]);
  const login = new URL("/login", request.url);
  login.searchParams.set("verified", "1");
  login.searchParams.set("from", next);
  return NextResponse.redirect(login);
}
