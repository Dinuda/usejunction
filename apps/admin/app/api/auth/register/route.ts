import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@usejunction/db";
import { appUrl, createAuthActionToken, sendAuthEmail } from "@/lib/auth-actions";
import { ensureOwnerWorkspace } from "@/lib/ensure-workspace";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const intent = body.intent === "team" ? "team" : null;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password !== body.confirmPassword) {
      return NextResponse.json({ error: "Enter a valid name, work email, and matching password of at least 12 characters." }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 12) } });
      if (intent) await prisma.planInterest.create({ data: { plan: intent, email, name, userId: user.id } });
      await ensureOwnerWorkspace({ id: user.id, email: user.email, name: user.name });
    } else {
      await ensureOwnerWorkspace({ id: user.id, email: user.email, name: user.name });
    }

    if (!user.emailVerified) {
      const token = await createAuthActionToken(user.id, "email_verification", 24 * 60 * 60 * 1000);
      await sendAuthEmail({ to: email, subject: "Verify your UseJunction account", url: appUrl(`/api/auth/verify?token=${token}`) });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json({ error: "Unable to create your account right now." }, { status: 500 });
  }
}
