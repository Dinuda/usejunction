import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import { sendTeamInviteEmail } from "@/lib/auth-actions";
import { buildTeamInviteLinkUrl, getPublicAppUrl } from "@/lib/connect-command";
import { normalizeEmail } from "@/lib/developer-identity";
import { notifyTeamSeatsAdded } from "@/lib/notifications/slack";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import {
  ASSIGNABLE_ROLES,
  canManageSettings,
  type OrganizationRole,
} from "@/lib/rbac/permissions";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function resolveInviteRole(
  actorRole: OrganizationRole,
  requested: AssignableRole,
): AssignableRole | NextResponse {
  if (canManageSettings(actorRole)) return requested;
  if (requested === "user") return "user";
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

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

/** Track emailed / shared invites so Team → Invited can list pending people. */
async function recordPendingInvite(params: {
  orgId: string;
  email: string;
  role: AssignableRole;
  invitedByUserId: string;
  expiresAt: Date;
}) {
  const existingMember = await prisma.developer.findUnique({
    where: { orgId_email: { orgId: params.orgId, email: params.email } },
    select: { id: true, removedAt: true },
  });
  if (existingMember && !existingMember.removedAt) return null;

  const existing = await prisma.organizationInvite.findFirst({
    where: {
      orgId: params.orgId,
      email: params.email,
      acceptedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    return prisma.organizationInvite.update({
      where: { id: existing.id },
      data: { expiresAt: params.expiresAt, role: params.role },
      select: { id: true, email: true, role: true },
    });
  }

  const token = generateOpaqueToken("uj_invite", 32);
  return prisma.organizationInvite.create({
    data: {
      orgId: params.orgId,
      email: params.email,
      role: params.role,
      tokenHash: hashOpaqueToken(token),
      expiresAt: params.expiresAt,
      invitedByUserId: params.invitedByUserId,
    },
    select: { id: true, email: true, role: true },
  });
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
  role: z.enum(ASSIGNABLE_ROLES).optional().default("user"),
});

export async function PUT(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const parsed = allowlistSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "add at least one valid email" }, { status: 400 });
  }

  const inviteRole = resolveInviteRole(auth.role, parsed.data.role);
  if (inviteRole instanceof NextResponse) return inviteRole;

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

  const inviteExpiresAt = link.expiresAt && link.expiresAt > new Date() ? link.expiresAt : defaultInviteExpiry(new Date());

  for (const email of emails) {
    const row = await prisma.teamInviteAllowlist.upsert({
      where: { linkId_email: { linkId: link.id, email } },
      update: {},
      create: { linkId: link.id, email },
      select: { email: true, createdAt: true },
    });
    added.push(row);

    await recordPendingInvite({
      orgId: auth.orgId,
      email,
      role: inviteRole,
      invitedByUserId: auth.userId,
      expiresAt: inviteExpiresAt,
    });

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

/** Update pending invite role and/or resend invite email(s). */
export async function PATCH(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const roleUpdate = z
    .object({
      email: z.string().email(),
      role: z.enum(ASSIGNABLE_ROLES),
    })
    .safeParse(body);

  if (roleUpdate.success && body.role !== undefined && !body.emails && body.resend !== true) {
    const email = normalizeEmail(roleUpdate.data.email);
    const inviteRole = resolveInviteRole(auth.role, roleUpdate.data.role);
    if (inviteRole instanceof NextResponse) return inviteRole;

    const invite = await prisma.organizationInvite.findFirst({
      where: {
        orgId: auth.orgId,
        email,
        acceptedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true },
    });
    if (!invite) return NextResponse.json({ error: "invite not found" }, { status: 404 });

    const updated = await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { role: inviteRole },
      select: { id: true, email: true, role: true },
    });
    await audit({
      orgId: auth.orgId,
      actorType: "user",
      actorId: auth.userId,
      action: "invite.role_updated",
      targetType: "invite",
      targetId: invite.id,
      metadata: { email, from: invite.role, to: inviteRole },
    });
    return NextResponse.json(updated);
  }

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

  const { link } = await ensureLink(auth.orgId, auth.userId, false);
  const allowlisted = new Set(link.allowlist.map((row) => row.email));
  const pendingInvites = await prisma.organizationInvite.findMany({
    where: {
      orgId: auth.orgId,
      email: { in: emails },
      acceptedAt: null,
    },
    select: { id: true, email: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  const pendingByEmail = new Map<string, { id: string; expiresAt: Date }>();
  for (const invite of pendingInvites) {
    if (!pendingByEmail.has(invite.email)) pendingByEmail.set(invite.email, invite);
  }
  const inviteExpiresAt =
    link.expiresAt && link.expiresAt > new Date() ? link.expiresAt : defaultInviteExpiry(new Date());
  const inviteUrl = buildTeamInviteLinkUrl(link.tokenReveal, getPublicAppUrl());
  const organizationName = await orgName(auth.orgId);
  const inviter = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, email: true },
  });
  const invitedBy = { name: inviter?.name, email: inviter?.email ?? auth.email };
  const emailResults: Array<{ email: string; status: "sent" | "email_failed" | "not_allowlisted"; error?: string }> =
    [];
  const now = new Date();

  for (const email of emails) {
    const pending = pendingByEmail.get(email);
    if (!allowlisted.has(email) && !pending) {
      emailResults.push({ email, status: "not_allowlisted" });
      continue;
    }
    if (pending && pending.expiresAt <= now) {
      const token = generateOpaqueToken("uj_invite", 32);
      await prisma.organizationInvite.update({
        where: { id: pending.id },
        data: {
          tokenHash: hashOpaqueToken(token),
          expiresAt: inviteExpiresAt,
        },
      });
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

  return NextResponse.json({ emailResults, url: inviteUrl, expiresAt: inviteExpiresAt.toISOString() });
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
