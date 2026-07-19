import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@usejunction/db";
import {
  buildConnectInviteCommand,
  buildConnectInviteUrl,
  buildPlatformConnectInviteCommands,
  getPublicAppUrl,
} from "@/lib/connect-command";
import { normalizeEmail } from "@/lib/developer-identity";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

const schema = z
  .object({
    email: z.string().email().optional(),
    emails: z.array(z.string().email()).min(1).max(100).optional(),
  })
  .refine((value) => Boolean(value.email || value.emails?.length), {
    message: "at least one email is required",
  });

async function createConnectInviteForEmail(input: {
  orgId: string;
  userId: string;
  email: string;
}) {
  const email = normalizeEmail(input.email);
  const existingDeveloper = await prisma.developer.findUnique({
    where: { orgId_email: { orgId: input.orgId, email } },
    select: { id: true },
  });

  let inviteId: string | null = null;
  if (!existingDeveloper) {
    const pending = await prisma.organizationInvite.findFirst({
      where: { orgId: input.orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      inviteId = pending.id;
    } else {
      const inviteToken = generateOpaqueToken("uj_invite", 32);
      const invite = await prisma.organizationInvite.create({
        data: {
          orgId: input.orgId,
          email,
          role: "user",
          tokenHash: hashOpaqueToken(inviteToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedByUserId: input.userId,
        },
        select: { id: true },
      });
      inviteId = invite.id;
    }
  }

  const connectToken = generateOpaqueToken("uj_connect", 32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const connectInvite = await prisma.connectInvite.create({
    data: {
      orgId: input.orgId,
      email,
      tokenHash: hashOpaqueToken(connectToken),
      inviteId,
      status: "pending",
      expiresAt,
    },
    select: { id: true },
  });

  await audit({
    orgId: input.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "connect_invite.created",
    targetType: "connect_invite",
    targetId: connectInvite.id,
    metadata: { email, hasDeveloper: Boolean(existingDeveloper) },
  });

  const base = getPublicAppUrl();
  const connectCommands = buildPlatformConnectInviteCommands(connectToken, base);
  return {
    email,
    command: buildConnectInviteCommand(connectToken, base),
    connectCommands,
    joinUrl: buildConnectInviteUrl(connectToken, base),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("org_overview"));
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Add at least one valid work email." }, { status: 400 });
  }

  const emails = [
    ...new Set(
      [...(parsed.data.emails ?? []), ...(parsed.data.email ? [parsed.data.email] : [])].map(normalizeEmail),
    ),
  ]
    .filter(Boolean)
    .slice(0, 100);

  if (!emails.length) {
    return NextResponse.json({ error: "Add at least one valid work email." }, { status: 400 });
  }

  const results = [];
  for (const email of emails) {
    try {
      results.push({ status: "ok" as const, ...(await createConnectInviteForEmail({ orgId: auth.orgId, userId: auth.userId, email })) });
    } catch (cause) {
      console.error("[team/connect-invite]", cause);
      results.push({
        status: "error" as const,
        email,
        error: "Unable to create connect invite",
      });
    }
  }

  return NextResponse.json(
    {
      results,
      ...(results.length === 1 && results[0].status === "ok" ? results[0] : {}),
    },
    { status: 201 },
  );
}
