import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";
import { prisma } from "@usejunction/db";
import { getPublicAppUrl } from "@/lib/public-url";

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
}: {
  to: string;
  subject: string;
  url: string;
  text?: string;
  html?: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const bodyText = text ?? `Use this link to continue: ${url}`;
  const bodyHtml = html ?? `<p>Use this link to continue:</p><p><a href="${url}">${url}</a></p>`;

  if (!key) {
    console.info(`[auth email] RESEND_API_KEY not set — ${subject} for ${to}: ${url}`);
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
  });

  if (error) {
    console.error("[auth email] Resend error:", error);
    throw new Error("Unable to send email");
  }

  console.info(`[auth email] sent id=${data?.id} to=${to} from=${from}`);
}

export async function sendTeamInviteEmail({
  to,
  organizationName,
  inviteUrl,
}: {
  to: string;
  organizationName: string;
  inviteUrl: string;
}) {
  const subject = `Join ${organizationName} on UseJunction`;
  const text = [
    `You've been invited to join ${organizationName} on UseJunction.`,
    "",
    "1. Open this invite link (sign up or sign in with this email):",
    inviteUrl,
    "",
    "2. After you're in, install UseJunction on your machine from the page (copy the command or download the macOS installer).",
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b;max-width:520px">
      <p>You've been invited to join <strong>${escapeHtml(organizationName)}</strong> on UseJunction.</p>
      <ol>
        <li style="margin-bottom:8px">Open your invite link and <strong>sign up or sign in</strong> with <strong>${escapeHtml(to)}</strong>.</li>
        <li style="margin-bottom:8px">On the page, install UseJunction on your machine by copying the Terminal command.</li>
      </ol>
      <p style="margin:24px 0">
        <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;font-weight:600">
          Open invite
        </a>
      </p>
      <p style="font-size:13px;color:#71717a;word-break:break-all">${escapeHtml(inviteUrl)}</p>
      <p style="font-size:12px;color:#a1a1aa">If you weren't expecting this, you can ignore this email.</p>
    </div>
  `;

  await sendAuthEmail({ to, subject, url: inviteUrl, text, html });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createAuthActionToken(userId: string, type: string, ttlMs: number) {
  const raw = randomBytes(32).toString("hex");
  await prisma.authActionToken.deleteMany({ where: { userId, type, consumedAt: null } });
  await prisma.authActionToken.create({
    data: { userId, type, tokenHash: hashActionToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}
