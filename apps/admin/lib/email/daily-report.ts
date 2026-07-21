import { Resend } from "resend";
import { credentialFingerprint } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";
import { buildDailyReportEmailDocument } from "@/lib/email/daily-report-html";
import { buildDailyReportPdfHtml } from "@/lib/email/daily-report-pdf";
import { renderHtmlToPdf } from "@/lib/email/render-pdf";
import type { DailyReportPayload } from "@/lib/reports/daily-report";
import { getPublicAppUrl } from "@/lib/public-url";

function authEmailFrom() {
  return (
    process.env.AUTH_EMAIL_FROM ??
    (process.env.NODE_ENV === "production"
      ? "UseJunction <hello@tallei.com>"
      : "UseJunction <onboarding@resend.dev>")
  );
}

export function buildDailyReportEmail(input: {
  report: DailyReportPayload;
  recipientName?: string | null;
}) {
  return buildDailyReportEmailDocument({
    ...input,
    appOrigin: getPublicAppUrl(),
  });
}

function buildTeaserEmail(input: {
  report: DailyReportPayload;
  recipientName?: string | null;
  url: string;
  settingsUrl: string;
  subject: string;
}) {
  const { report } = input;
  const isTeamWeek = report.kind === "org" && report.period === "week";
  const first = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const blurb = isTeamWeek
    ? "Your team week report is attached as a PDF."
    : report.kind === "org"
      ? "Your team day report is attached as a PDF."
      : "Your day report is attached as a PDF.";
  const cta = isTeamWeek ? "Open this week's report" : "Open today's report";

  const text = [
    greeting,
    "",
    blurb,
    "",
    `Open in the app: ${input.url}`,
    `Manage email reports: ${input.settingsUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f3f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f2ee;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e2e3dd;border-radius:12px;">
        <tr>
          <td style="padding:28px 28px 8px;">
            <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6a64;font-weight:600;">UseJunction</div>
            <div style="margin-top:12px;font-size:22px;font-weight:600;color:#111210;letter-spacing:-0.02em;">${escapeHtml(input.subject)}</div>
            <p style="margin:14px 0 0;font-size:15px;line-height:1.55;color:#6b6a64;">${escapeHtml(greeting)}</p>
            <p style="margin:8px 0 0;font-size:15px;line-height:1.55;color:#6b6a64;">${escapeHtml(blurb)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 28px;">
            <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#e5ec67;color:#111210;text-decoration:none;padding:12px 18px;font-weight:600;font-size:14px;border:1px solid #838a20;border-radius:8px;">${escapeHtml(cta)}</a>
            <div style="margin-top:18px;font-size:12px;color:#6b6a64;">
              <a href="${escapeHtml(input.settingsUrl)}" style="color:#08758a;">Manage email reports</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendDailyReportEmail(input: {
  to: string;
  report: DailyReportPayload;
  recipientName?: string | null;
}) {
  const appOrigin = getPublicAppUrl();
  const pdfDoc = buildDailyReportPdfHtml({
    report: input.report,
    recipientName: input.recipientName,
    appOrigin,
  });
  const pdfBuffer = await renderHtmlToPdf(pdfDoc.html);
  const settingsUrl = `${appOrigin}/settings`;
  const teaser = buildTeaserEmail({
    report: input.report,
    recipientName: input.recipientName,
    url: pdfDoc.url,
    settingsUrl,
    subject: pdfDoc.subject,
  });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[daily report email] RESEND_API_KEY not set; subject=${pdfDoc.subject} to=${input.to} pdfBytes=${pdfBuffer.byteLength} tokenFingerprint=${credentialFingerprint(pdfDoc.url)}`,
    );
    return { ...pdfDoc, text: teaser.text, html: teaser.html, pdfBytes: pdfBuffer.byteLength };
  }

  const from = authEmailFrom();
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: pdfDoc.subject,
    text: teaser.text,
    html: teaser.html,
    attachments: [
      {
        filename: pdfDoc.filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  if (error) {
    logServerError("daily report email", error);
    throw new Error("Unable to send daily report email");
  }

  console.info(
    `[daily report email] sent id=${data?.id} to=${input.to} from=${from} pdf=${pdfDoc.filename} bytes=${pdfBuffer.byteLength}`,
  );
  return { ...pdfDoc, text: teaser.text, html: teaser.html, pdfBytes: pdfBuffer.byteLength };
}
