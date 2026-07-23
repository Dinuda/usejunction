import { Resend } from "resend";
import { credentialFingerprint } from "@/lib/security";
import { logServerError } from "@/lib/errors/public";
import { buildDailyReportEmailDocument } from "@/lib/email/daily-report-html";
import { buildDailyReportPdfHtml } from "@/lib/email/daily-report-pdf";
import { renderHtmlToPdf } from "@/lib/email/render-pdf";
import type { DailyReportPayload } from "@/lib/reports/daily-report";
import { getPublicAppUrl } from "@/lib/public-url";

export function reportsEmailFrom() {
  return (
    process.env.REPORTS_EMAIL_FROM ??
    (process.env.NODE_ENV === "production"
      ? "UseJunction <reporting@usejunction.dev>"
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

export function buildReportEmailText(input: {
  report: DailyReportPayload;
  recipientName?: string | null;
}) {
  const { report } = input;
  const isTeamWeek = report.kind === "org" && report.period === "week";
  const first = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : "Hi,";
  const blurb = isTeamWeek
    ? "Please find your team's AI use report for this week attached as a PDF."
    : report.kind === "org"
      ? "Please find your team's AI use report for today attached as a PDF."
      : "Please find your AI use report for today attached as a PDF.";

  return [
    greeting,
    "",
    blurb,
    "",
    "Best regards,",
    "Junction AI Assistant",
    "AI Analytics Team",
  ].join("\n");
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
  const text = buildReportEmailText({
    report: input.report,
    recipientName: input.recipientName,
  });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(
      `[daily report email] RESEND_API_KEY not set; subject=${pdfDoc.subject} to=${input.to} pdfBytes=${pdfBuffer.byteLength} tokenFingerprint=${credentialFingerprint(pdfDoc.url)}`,
    );
    return { ...pdfDoc, text, pdfBytes: pdfBuffer.byteLength };
  }

  const from = reportsEmailFrom();
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: pdfDoc.subject,
    text,
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
  return { ...pdfDoc, text, pdfBytes: pdfBuffer.byteLength };
}
