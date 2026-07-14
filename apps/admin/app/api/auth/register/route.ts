import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@usejunction/db";
import { appUrl, createAuthActionToken, safeAuthNextPath, sendAuthEmail } from "@/lib/auth-actions";
import { ensureOwnerWorkspace } from "@/lib/ensure-workspace";

function isInviteSignup(from: string) {
  return from.startsWith("/i/") || from.startsWith("/join/") || from.startsWith("/connect-invite/");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const intent = body.intent === "team" ? "team" : null;
    const from = safeAuthNextPath(typeof body.from === "string" ? body.from : null, "/dashboard");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || password !== body.confirmPassword) {
      return NextResponse.json(
        { error: "Enter a valid name, work email, and matching password of at least 12 characters." },
        { status: 400 },
      );
    }

    const joiningViaInvite = isInviteSignup(from);
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { name, email, passwordHash: await hash(password, 12) } });
      if (intent) await prisma.planInterest.create({ data: { plan: intent, email, name, userId: user.id } });
      // Invitees join an existing org on redeem — don't create a personal workspace first.
      if (!joiningViaInvite) {
        await ensureOwnerWorkspace({ id: user.id, email: user.email, name: user.name });
      }
    } else if (!joiningViaInvite) {
      await ensureOwnerWorkspace({ id: user.id, email: user.email, name: user.name });
    }

    if (!user.emailVerified) {
      const token = await createAuthActionToken(user.id, "email_verification", 24 * 60 * 60 * 1000);
      const verifyPath = `/api/auth/verify?token=${encodeURIComponent(token)}&next=${encodeURIComponent(from)}`;
      await sendAuthEmail({
        to: email,
        subject: "Verify your UseJunction account",
        url: appUrl(verifyPath),
      });
    }

    return NextResponse.json({
      ok: true,
      next: from,
      needsVerification: !user.emailVerified,
    });
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json({ error: "Unable to create your account right now." }, { status: 500 });
  }
}
