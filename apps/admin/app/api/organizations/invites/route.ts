import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { appUrl, sendAuthEmail } from "@/lib/auth-actions";
import { normalizeEmail } from "@/lib/developer-identity";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

const schema = z.object({
  email: z.string().email().optional(),
  emails: z.array(z.string().email()).min(1).max(100).optional(),
  role: z.enum(["admin", "manager", "user"]).default("user"),
}).refine((value) => Boolean(value.email || value.emails?.length), { message: "at least one email is required" });

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const invites = await prisma.organizationInvite.findMany({
    where: { orgId: auth.orgId },
    select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "valid email and role required" }, { status: 400 });
  const emails = [...new Set([...(parsed.data.emails ?? []), ...(parsed.data.email ? [parsed.data.email] : [])].map(normalizeEmail))];
  const results = [];
  for (const email of emails) {
    const token = generateOpaqueToken("uj_invite", 32);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await prisma.organizationInvite.create({
      data: { orgId: auth.orgId, email, role: parsed.data.role, tokenHash: hashOpaqueToken(token), expiresAt, invitedByUserId: auth.userId },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    const url = appUrl(`/join/${encodeURIComponent(token)}`);
    let status: "sent" | "email_failed" = "sent";
    let error: string | null = null;
    try {
      await sendAuthEmail({ to: email, subject: "Join your UseJunction workspace", url });
    } catch (cause) {
      status = "email_failed";
      console.error("[organizations/invites] email failed", cause);
      error = "Unable to send invitation email";
    }
    await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "invite.created", targetType: "invite", targetId: invite.id, metadata: { email, role: invite.role, status } });
    results.push({ invite, status, error, ...(process.env.NODE_ENV === "production" ? {} : { token, url }) });
  }
  return NextResponse.json({ results, ...(results.length === 1 ? results[0] : {}) }, { status: 201 });
}
