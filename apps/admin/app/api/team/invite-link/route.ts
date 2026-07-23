import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { sendTeamInviteEmail } from "@/lib/auth-actions";
import { buildTeamInviteLinkUrl, getPublicAppUrl } from "@/lib/connect-command";
import { normalizeEmail } from "@/lib/developer-identity";
import { notifyTeamSeatsAdded } from "@/lib/notifications/slack";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";

const TEAM_INVITE_TTL_DAYS = 7;

function defaultInviteExpiry(now: Date) {
  return new Date(now.getTime() + TEAM_INVITE_TTL_DAYS * 24 * 60 * 60_000);
}

function serializeLink(link: {
  id: string;
  enabled: boolean;
  expiresAt: Date | null;
  rotatedAt: Date;
  createdAt: Date;
  tokenReveal: string;
  allowlist: { email: string; createdAt: Date }[];
}) {
  const base = getPublicAppUrl();
  return {
    link: {
      id: link.id,
      enabled: link.enabled,
      expiresAt: link.expiresAt,
      rotatedAt: link.rotatedAt,
      createdAt: link.createdAt,
    },
    allowlist: link.allowlist,
    url: buildTeamInviteLinkUrl(link.tokenReveal, base),
    token: link.tokenReveal,
  };
}

async function ensureLink(orgId: string, userId: string, rotate: boolean) {
  const existing = await prisma.teamInviteLink.findUnique({
    where: { orgId },
    include: { allowlist: { select: { email: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });

  const rawToken = generateOpaqueToken("uj_team", 24);
  const tokenHash = hashOpaqueToken(rawToken);
  const now = new Date();
  const expiresAt = defaultInviteExpiry(now);
  if (existing && !rotate && (!existing.expiresAt || existing.expiresAt > now)) return { link: existing, created: false };

  const link = existing
    ? await prisma.teamInviteLink.update({
        where: { orgId },
        data: { tokenHash, tokenReveal: rawToken, enabled: true, expiresAt, rotatedAt: now },
        include: { allowlist: { select: { email: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
      })
    : await prisma.teamInviteLink.create({
        data: { orgId, tokenHash, tokenReveal: rawToken, enabled: true, expiresAt, rotatedAt: now },
        include: { allowlist: { select: { email: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
      });

  await audit({
    orgId,
    actorType: "user",
    actorId: userId,
    action: existing ? "team_invite_link.rotated" : "team_invite_link.created",
    targetType: "team_invite_link",
    targetId: link.id,
  });

  return { link, created: !existing };
}

async function orgName(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  return org?.name ?? "your workspace";
}

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const existing = await prisma.teamInviteLink.findUnique({
    where: { orgId: auth.orgId },
    include: { allowlist: { select: { email: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
  });

  if (!existing) {
    return NextResponse.json({ link: null, allowlist: [], url: null, token: null });
  }

  return NextResponse.json(serializeLink(existing));
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const rotate = Boolean(body?.rotate);
  const { link, created } = await ensureLink(auth.orgId, auth.userId, rotate);

  return NextResponse.json(serializeLink(link), { status: created ? 201 : 200 });
}

const allowlistSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(100),
  sendEmail: z.boolean().optional().default(true),
});

export async function PUT(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const parsed = allowlistSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "add at least one valid email" }, { status: 400 });
  }

  const { link } = await ensureLink(auth.orgId, auth.userId, false);
  const emails = [...new Set(parsed.data.emails.map(normalizeEmail))];
  const existingEmails = new Set(link.allowlist.map((row) => row.email));
  const inviteUrl = serializeLink({ ...link, allowlist: link.allowlist }).url;
  const organizationName = await orgName(auth.orgId);
  const inviter = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });
  const invitedBy = { name: inviter?.name, email: inviter?.email ?? auth.email };
  const added = [];
  const emailResults: Array<{ email: string; status: "sent" | "skipped" | "email_failed"; error?: string }> = [];

  for (const email of emails) {
    const row = await prisma.teamInviteAllowlist.upsert({
      where: { linkId_email: { linkId: link.id, email } },
      update: {},
      create: { linkId: link.id, email },
      select: { email: true, createdAt: true },
    });
    added.push(row);

    const existingDeveloper = await prisma.developer.findUnique({
      where: { orgId_email: { orgId: auth.orgId, email } },
      select: { id: true },
    });
    if (!existingDeveloper) {
      const pending = await prisma.organizationInvite.findFirst({
        where: { orgId: auth.orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!pending) {
        await prisma.organizationInvite.create({
          data: {
            orgId: auth.orgId,
            email,
            role: "user",
            tokenHash: hashOpaqueToken(generateOpaqueToken("uj_invite", 32)),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invitedByUserId: auth.userId,
          },
        });
      }
    }

    if (!parsed.data.sendEmail) {
      emailResults.push({ email, status: "skipped" });
      continue;
    }

    try {
      await sendTeamInviteEmail({ to: email, organizationName, inviteUrl, invitedBy });
      emailResults.push({ email, status: "sent" });
    } catch (cause) {
      logServerError("team/invite-link", cause);
      emailResults.push({
        email,
        status: "email_failed",
        error: "Unable to send email",
      });
    }
  }

  // Clear invited emails from the allowlist so the UI list does not linger after success.
  await prisma.teamInviteAllowlist.deleteMany({
    where: { linkId: link.id, email: { in: emails } },
  });

  const allowlist = await prisma.teamInviteAllowlist.findMany({
    where: { linkId: link.id },
    select: { email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const newlyAddedEmails = emails.filter((email) => !existingEmails.has(email));
  if (newlyAddedEmails.length > 0) {
    notifyTeamSeatsAdded({
      organizationName,
      orgId: auth.orgId,
      actorEmail: auth.email,
      emails: newlyAddedEmails,
    });
  }

  return NextResponse.json({
    added,
    allowlist,
    url: inviteUrl,
    emailResults,
  });
}

/** Resend invite email(s) for allowlisted addresses. */
export async function PATCH(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const emailsRaw: unknown[] = Array.isArray(body.emails)
    ? body.emails
    : body.email
      ? [body.email]
      : [];
  const emails = [
    ...new Set(
      emailsRaw
        .map((value) => normalizeEmail(String(value ?? "")))
        .filter((email): email is string => Boolean(email)),
    ),
  ];
  if (!emails.length) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const link = await prisma.teamInviteLink.findUnique({
    where: { orgId: auth.orgId },
    include: { allowlist: { select: { email: true } } },
  });
  if (!link) return NextResponse.json({ error: "invite link not found" }, { status: 404 });

  const allowlisted = new Set(link.allowlist.map((row) => row.email));
  const inviteUrl = buildTeamInviteLinkUrl(link.tokenReveal, getPublicAppUrl());
  const organizationName = await orgName(auth.orgId);
  const inviter = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });
  const invitedBy = { name: inviter?.name, email: inviter?.email ?? auth.email };
  const emailResults: Array<{ email: string; status: "sent" | "email_failed" | "not_allowlisted"; error?: string }> =
    [];

  for (const email of emails) {
    if (!allowlisted.has(email)) {
      emailResults.push({ email, status: "not_allowlisted" });
      continue;
    }
    try {
      await sendTeamInviteEmail({ to: email, organizationName, inviteUrl, invitedBy });
      emailResults.push({ email, status: "sent" });
    } catch (cause) {
      logServerError("team/invite-link", cause);
      emailResults.push({
        email,
        status: "email_failed",
        error: "Unable to send email",
      });
    }
  }

  return NextResponse.json({ emailResults, url: inviteUrl });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const email = normalizeEmail(String(new URL(req.url).searchParams.get("email") ?? ""));
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const link = await prisma.teamInviteLink.findUnique({ where: { orgId: auth.orgId } });
  if (!link) return NextResponse.json({ error: "invite link not found" }, { status: 404 });

  await prisma.teamInviteAllowlist.deleteMany({ where: { linkId: link.id, email } });
  // Revoke pending invite access for this email; leave accepted invites alone.
  await prisma.organizationInvite.deleteMany({
    where: {
      orgId: auth.orgId,
      email,
      acceptedAt: null,
    },
  });
  const allowlist = await prisma.teamInviteAllowlist.findMany({
    where: { linkId: link.id },
    select: { email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ allowlist });
}
