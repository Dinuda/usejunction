import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { hashActionToken } from "@/lib/auth-actions";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=invalid_verification", request.url));
  const action = await prisma.authActionToken.findFirst({ where: { tokenHash: hashActionToken(token), type: "email_verification", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!action) return NextResponse.redirect(new URL("/login?error=expired_verification", request.url));
  await prisma.$transaction([
    prisma.user.update({ where: { id: action.userId }, data: { emailVerified: new Date() } }),
    prisma.authActionToken.update({ where: { id: action.id }, data: { consumedAt: new Date() } }),
  ]);
  return NextResponse.redirect(new URL("/login?verified=1&from=/dashboard", request.url));
}
