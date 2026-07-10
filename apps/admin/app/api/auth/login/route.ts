import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, createSessionToken, COOKIE_NAME, MAX_AGE_SEC } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "email and password required" }, { status: 400 });
    }

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }

    const token = await createSessionToken(email);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE_SEC,
      path: "/",
    });

    return res;
  } catch {
    return NextResponse.json({ error: "login failed" }, { status: 500 });
  }
}
