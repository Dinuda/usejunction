import { getPublicAppUrl } from "@/lib/public-url";
import { siteConfig } from "@/lib/public/config";

/** CID ids for Resend inline attachments — must match sendTeamInviteEmail. */
export const TEAM_INVITE_LOGO_CID = "uj-logo";
export const TEAM_INVITE_HERO_CID = "uj-team-invite-hero";

/** Brand tokens mirrored from globals.css — email-safe solid colors only. */
const brand = {
  teal: "#08758a",
  charcoal: "#111210",
  muted: "#6b6a64",
  border: "#e8e8e3",
  wash: "#f6f6f3",
  page: "#f0efeb",
  white: "#ffffff",
  link: "#08758a",
} as const;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inviterLabel(invitedBy?: { name?: string | null; email?: string | null } | null) {
  const name = invitedBy?.name?.trim() || "";
  const email = invitedBy?.email?.trim() || "";
  if (name && email) return { display: name, email };
  if (name) return { display: name, email: "" };
  if (email) return { display: email, email };
  return null;
}

/** "Dinuda Yaggahavita workspace" → "Dinuda Yaggahavita's workspace" */
export function formatWorkspaceDisplayName(name: string) {
  const trimmed = name.trim();
  if (/'s\s+workspace$/i.test(trimmed)) return trimmed;
  return trimmed.replace(/\s+workspace$/i, "'s workspace");
}

export function buildTeamInviteEmailDocument(input: {
  organizationName: string;
  inviteUrl: string;
  recipientEmail: string;
  invitedBy?: { name?: string | null; email?: string | null } | null;
  /** Absolute app origin, e.g. https://app.usejunction.com */
  appOrigin?: string;
  /**
   * When true, logo/hero use cid: URLs for Resend inline attachments
   * (required for localhost / private origins that email clients cannot fetch).
   */
  inlineAssets?: boolean;
}) {
  const origin = (input.appOrigin ?? getPublicAppUrl()).replace(/\/$/, "");
  const homeUrl = `${origin}/`;
  const logoUrl = input.inlineAssets
    ? `cid:${TEAM_INVITE_LOGO_CID}`
    : `${origin}/usejunction.png`;
  const heroUrl = input.inlineAssets
    ? `cid:${TEAM_INVITE_HERO_CID}`
    : `${origin}/images/team-invite.png`;
  const org = formatWorkspaceDisplayName(input.organizationName.trim() || "your team");
  const email = input.recipientEmail.trim();
  const inviteUrl = input.inviteUrl;
  const inviter = inviterLabel(input.invitedBy);
  const subject = `Join ${org} on UseJunction`;

  const inviteSentence = inviter
    ? inviter.email && inviter.display !== inviter.email
      ? `${inviter.display} (${inviter.email}) has invited you to join ${org} on UseJunction.`
      : `${inviter.display} has invited you to join ${org} on UseJunction.`
    : `You've been invited to join ${org} on UseJunction.`;

  const text = [
    `Join your team on UseJunction`,
    "",
    inviteSentence,
    "",
    `Open this invite link and continue with ${email}:`,
    inviteUrl,
    "",
    `What is UseJunction? ${siteConfig.tagline}.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  const inviteHtml = inviter
    ? inviter.email && inviter.display !== inviter.email
      ? `<strong>${escapeHtml(inviter.display)}</strong>
              (<a href="mailto:${escapeHtml(inviter.email)}" style="color:${brand.link};text-decoration:underline;">${escapeHtml(inviter.email)}</a>)
              has invited you to join <strong>${escapeHtml(org)}</strong> on UseJunction.`
      : `<strong>${escapeHtml(inviter.display)}</strong> has invited you to join
              <strong>${escapeHtml(org)}</strong> on UseJunction.`
    : `You've been invited to join <strong>${escapeHtml(org)}</strong> on UseJunction.`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.page};font-family:Inter,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.page};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">

        <!-- Logo -->
        <tr>
          <td style="padding:0 8px 28px;">
            <a href="${escapeHtml(homeUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="132" height="32" alt="UseJunction" style="display:block;border:0;width:132px;height:32px;" />
            </a>
          </td>
        </tr>

        <!-- Headline + intro -->
        <tr>
          <td style="padding:0 8px 28px;">
            <div style="font-size:28px;font-weight:700;color:${brand.charcoal};letter-spacing:-0.03em;line-height:1.2;">
              Join your team on UseJunction
            </div>
            <p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:${brand.charcoal};">
              ${inviteHtml}
            </p>
            <p style="margin:12px 0 0;font-size:15px;line-height:1.7;color:${brand.muted};">
              Continue with
              <a href="mailto:${escapeHtml(email)}" style="color:${brand.link};text-decoration:underline;">${escapeHtml(email)}</a>.
            </p>
          </td>
        </tr>

        <!-- Invite card -->
        <tr>
          <td style="padding:0 0 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.white};border:1px solid ${brand.border};border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:0;line-height:0;font-size:0;background:${brand.wash};">
                  <img
                    src="${escapeHtml(heroUrl)}"
                    width="560"
                    alt="Teammates collaborating on UseJunction"
                    style="display:block;border:0;width:100%;max-width:560px;height:auto;"
                  />
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:28px 28px 8px;">
                  <div style="font-size:18px;font-weight:700;color:${brand.charcoal};letter-spacing:-0.02em;line-height:1.3;">
                    ${escapeHtml(org)}
                  </div>
                  <div style="margin-top:6px;font-size:13px;color:${brand.muted};line-height:1.4;">
                    UseJunction workspace
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:20px 28px 32px;">
                  <a
                    href="${escapeHtml(inviteUrl)}"
                    style="display:inline-block;background:${brand.teal};color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:-0.01em;line-height:1;"
                  >
                    Join Now
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Quiet fallback -->
        <tr>
          <td style="padding:0 8px 32px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${brand.muted};">
              Having trouble with the button?
              <a href="${escapeHtml(inviteUrl)}" style="color:${brand.link};text-decoration:underline;">Copy this invite link</a>
            </p>
          </td>
        </tr>

        <!-- What is UseJunction -->
        <tr>
          <td style="padding:0 8px 28px;">
            <div style="font-size:16px;font-weight:700;color:${brand.charcoal};letter-spacing:-0.02em;">
              What is UseJunction?
            </div>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:${brand.muted};">
              ${escapeHtml(siteConfig.tagline)}. See which AI coding tools your team uses, plan utilization, and device health—before you try to control it.
              <a href="${escapeHtml(homeUrl)}" style="color:${brand.link};text-decoration:underline;">Learn more about UseJunction</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:8px 8px 0;border-top:1px solid ${brand.border};">
            <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${brand.muted};">
              If you weren't expecting this, you can ignore this email.
            </p>
            <p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${brand.muted};">
              <a href="${escapeHtml(homeUrl)}" style="color:${brand.muted};text-decoration:underline;">Made by UseJunction</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, logoUrl, heroUrl, homeUrl };
}
