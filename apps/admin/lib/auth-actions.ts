import { createHash, randomBytes } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { Resend } from "resend";
import { prisma } from "@usejunction/db";
import {
  TEAM_INVITE_HERO_CID,
  TEAM_INVITE_LOGO_CID,
  buildTeamInviteEmailDocument,
} from "@/lib/email/team-invite-html";
import { getPublicAppUrl } from "@/lib/public-url";
import { credentialFingerprint } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";

export function hashActionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function appUrl(path: string) {
  return `${getPublicAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Safe relative redirect targets after auth (blocks open redirects). */
export function safeAuthNextPath(raw: string | null | undefined, fallback = "/dashboard") {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return fallback;
  return path;
}

function authEmailFrom() {
  return (
    process.env.AUTH_EMAIL_FROM ??
    (process.env.NODE_ENV === "production"
      ? "UseJunction <hello@tallei.com>"
      : "UseJunction <onboarding@resend.dev>")
  );
}

export async function sendAuthEmail({
  to,
  subject,
  url,
  text,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  url: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    contentId?: string;
  }>;
}) {
  const key = process.env.RESEND_API_KEY;
  const bodyText = text ?? `Use this link to continue: ${url}`;
  const bodyHtml = html ?? `<p>Use this link to continue:</p><p><a href="${url}">${url}</a></p>`;

  if (!key) {
    console.info(`[auth email] RESEND_API_KEY not set; subject=${subject} to=${to} tokenFingerprint=${credentialFingerprint(url)}`);
    return;
  }

  const from = authEmailFrom();
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    text: bodyText,
    html: bodyHtml,
    ...(attachments?.length ? { attachments } : {}),
  });

  if (error) {
    logServerError("auth email", error);
    throw new Error("Unable to send email");
  }

  console.info(`[auth email] sent id=${data?.id} to=${to} from=${from}`);
}

async function loadTeamInviteInlineAssets() {
  const publicDir = path.join(process.cwd(), "public");
  const [logo, hero] = await Promise.all([
    readFile(path.join(publicDir, "usejunction.png")),
    readFile(path.join(publicDir, "images", "team-invite.png")),
  ]);
  return [
    {
      filename: "usejunction.png",
      content: logo,
      contentType: "image/png",
      contentId: TEAM_INVITE_LOGO_CID,
    },
    {
      filename: "team-invite.png",
      content: hero,
      contentType: "image/png",
      contentId: TEAM_INVITE_HERO_CID,
    },
  ];
}

export async function sendTeamInviteEmail({
  to,
  organizationName,
  inviteUrl,
  invitedBy,
}: {
  to: string;
  organizationName: string;
  inviteUrl: string;
  invitedBy?: { name?: string | null; email?: string | null } | null;
}) {
  const { subject, text, html: inlineHtml } = buildTeamInviteEmailDocument({
    organizationName,
    inviteUrl,
    recipientEmail: to,
    invitedBy,
    inlineAssets: true,
  });

  let attachments: Awaited<ReturnType<typeof loadTeamInviteInlineAssets>> | undefined;
  let html = inlineHtml;
  try {
    attachments = await loadTeamInviteInlineAssets();
  } catch (cause) {
    logServerError("team invite email assets", cause);
    // Fall back to absolute URLs if local files are unavailable.
    html = buildTeamInviteEmailDocument({
      organizationName,
      inviteUrl,
      recipientEmail: to,
      invitedBy,
      inlineAssets: false,
    }).html;
  }

  await sendAuthEmail({ to, subject, url: inviteUrl, text, html, attachments });
}

export async function createAuthActionToken(userId: string, type: string, ttlMs: number) {
  const raw = randomBytes(32).toString("hex");
  await prisma.authActionToken.deleteMany({ where: { userId, type, consumedAt: null } });
  await prisma.authActionToken.create({
    data: { userId, type, tokenHash: hashActionToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}
