import { sendAuthEmail } from "@/lib/auth-actions";
import { getPublicAppUrl } from "@/lib/public-url";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendDeviceRecoveryEmail(input: {
  to: string;
  recipientName?: string | null;
  hostname: string;
  os: string;
  deviceId: string;
  lastSeenAt: Date;
}) {
  const firstName = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const subject = `Connection needs attention on ${input.hostname}`;
  const repairPath = `/dashboard?scope=you&repair=${encodeURIComponent(input.deviceId)}`;
  const repairUrl = `${getPublicAppUrl()}${repairPath}`;
  const lastSeen = input.lastSeenAt.toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const text = [
    greeting,
    "",
    `UseJunction has not heard from ${input.hostname} (${input.os}) since ${lastSeen} UTC.`,
    "",
    "Open UseJunction on that machine and choose Repair connection to restore the existing agent enrollment.",
    "",
    repairUrl,
    "",
    "Best regards,",
    "UseJunction",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f0efeb;padding:32px 16px;font-family:Inter,Helvetica,Arial,sans-serif;color:#111210;">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8e8e3;">
    <p style="margin:0 0 20px;font-size:16px;">${escapeHtml(greeting)}</p>
    <h1 style="margin:0;font-size:24px;line-height:1.2;">Connection needs attention.</h1>
    <p style="margin:16px 0;color:#6b6a64;line-height:1.6;">UseJunction has not heard from <strong>${escapeHtml(input.hostname)}</strong> (${escapeHtml(input.os)}) since ${escapeHtml(lastSeen)} UTC.</p>
    <p style="margin:0 0 24px;color:#6b6a64;line-height:1.6;">Open UseJunction on that machine and repair the existing agent enrollment. Your history stays attached to this device.</p>
    <a href="${escapeHtml(repairUrl)}" style="display:inline-block;background:#08758a;color:#fff;text-decoration:none;padding:12px 18px;font-weight:600;">Repair connection</a>
  </div>
</body></html>`;

  await sendAuthEmail({
    to: input.to,
    subject,
    url: repairUrl,
    text,
    html,
  });
}
