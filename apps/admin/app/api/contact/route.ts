import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { Resend } from "resend";
import { limitedJson } from "@/lib/security/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, { key: "contact", limit: 5, windowSeconds: 60 });
  if (limited !== true) return limited;
  const parsedBody = await limitedJson(request, 32 * 1024);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim().slice(0, 160);
  const company = String(body.company ?? "").trim().slice(0, 160);
  const message = String(body.message ?? "").trim().slice(0, 4000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  await prisma.planInterest.create({ data: { plan: "enterprise", email, name, company: company || null, message: message || null } });
  if (process.env.RESEND_API_KEY && process.env.SALES_NOTIFICATION_TO) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: process.env.AUTH_EMAIL_FROM ?? "UseJunction <auth@usejunction.dev>", to: process.env.SALES_NOTIFICATION_TO, subject: `UseJunction enterprise inquiry from ${name}`, text: `${name} (${email})\n${company}\n\n${message}` });
  }
  return NextResponse.json({ ok: true });
}
