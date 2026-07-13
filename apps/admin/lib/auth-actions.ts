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

export async function sendAuthEmail({ to, subject, url }: { to: string; subject: string; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[auth email] RESEND_API_KEY not set — link for ${to}: ${url}`);
    return;
  }

  // Resend requires a verified domain. For local dev, use onboarding@resend.dev
  // (only delivers to the Resend account owner's email unless your domain is verified).
  const from =
    process.env.AUTH_EMAIL_FROM ??
    (process.env.NODE_ENV === "production"
      ? "UseJunction <hello@tallei.com>"
      : "UseJunction <onboarding@resend.dev>");

  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    text: `Use this link to continue: ${url}`,
    html: `<p>Use this link to continue:</p><p><a href="${url}">${url}</a></p>`,
  });

  if (error) {
    console.error("[auth email] Resend error:", error);
    throw new Error(error.message);
  }

  console.info(`[auth email] sent id=${data?.id} to=${to} from=${from}`);
}

export async function createAuthActionToken(userId: string, type: string, ttlMs: number) {
  const raw = randomBytes(32).toString("hex");
  await prisma.authActionToken.deleteMany({ where: { userId, type, consumedAt: null } });
  await prisma.authActionToken.create({
    data: { userId, type, tokenHash: hashActionToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}
