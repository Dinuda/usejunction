import { getPublicAppUrl } from "@/lib/public-url";

/** CID id for Resend inline attachment — must match sendTeamInviteEmail. */
export const TEAM_INVITE_LOGO_CID = "uj-logo";

/** Brand tokens mirrored from globals.css — email-safe solid colors only. */
const brand = {
  teal: "#08758a",
  charcoal: "#111210",
  muted: "#6b6a64",
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
   * When true, logo uses a cid: URL for Resend inline attachment
   * (required for localhost / private origins that email clients cannot fetch).
   */
  inlineAssets?: boolean;
}) {
  const origin = (input.appOrigin ?? getPublicAppUrl()).replace(/\/$/, "");
  const homeUrl = `${origin}/`;
  const logoUrl = input.inlineAssets
    ? `cid:${TEAM_INVITE_LOGO_CID}`
    : `${origin}/usejunction.png`;
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
    inviteSentence,
    "",
    `Open this invite link and continue with ${email}:`,
    inviteUrl,
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

  // Keep this transactional: personal invite copy + one CTA. No hero, product pitch,
  // or marketing footer — those push Gmail into the Promotions tab.
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.white};font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.white};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;">

        <tr>
          <td align="center" style="padding:0 0 24px;">
            <a href="${escapeHtml(homeUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="120" height="29" alt="UseJunction" style="display:block;border:0;width:120px;height:29px;margin:0 auto;" />
            </a>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 0 20px;">
            <p style="margin:0;font-size:16px;line-height:1.6;color:${brand.charcoal};text-align:center;">
              ${inviteHtml}
            </p>
            <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${brand.muted};text-align:center;">
              Continue with
              <a href="mailto:${escapeHtml(email)}" style="color:${brand.link};text-decoration:underline;">${escapeHtml(email)}</a>.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 0 24px;">
            <a
              href="${escapeHtml(inviteUrl)}"
              style="display:inline-block;background:${brand.teal};color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:0;font-weight:700;font-size:14px;line-height:1;"
            >
              Accept invite
            </a>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:0 0 24px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${brand.muted};text-align:center;">
              Or paste this link into your browser:<br />
              <a href="${escapeHtml(inviteUrl)}" style="color:${brand.link};text-decoration:underline;word-break:break-all;">${escapeHtml(inviteUrl)}</a>
            </p>
          </td>
        </tr>

        <tr>
          <td align="center">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${brand.muted};text-align:center;">
              If you weren't expecting this, you can ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, logoUrl, homeUrl };
}
