import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildDailyReportEmail, buildReportEmailText, reportsEmailFrom } from "@/lib/email/daily-report";
import { buildEmailColumnChartHtml } from "@/lib/email/daily-report-html";
import { buildDailyReportPdfHtml, buildPdfAreaChartSvg } from "@/lib/email/daily-report-pdf";
import type { DailyReportPayload } from "@/lib/reports/daily-report";

const report: DailyReportPayload = {
  kind: "personal",
  period: "day",
  localDate: "2026-07-21",
  timeZone: "Asia/Colombo",
  title: "Your day.",
  subtitle: "2026-07-21 · Asia/Colombo",
  kpis: {
    requests: 12,
    tokens: 3400,
    cost: 1.25,
    tools: 2,
    requestsDeltaPct: 10,
    costDeltaPct: -5,
    planUsedPercent: 42,
    acceptancePercent: 61,
  },
  series: [
    { label: "10:00", requests: 3, tokens: 100, cost: 0.1 },
    { label: "14:00", requests: 5, tokens: 200, cost: 0.5 },
    { label: "18:00", requests: 4, tokens: 150, cost: 0.65 },
  ],
  topTools: [
    {
      toolName: "chatgpt",
      displayName: "ChatGPT",
      requests: 8,
      tokens: 2000,
      cost: 0.9,
      sharePercent: 72,
    },
    {
      toolName: "cursor",
      displayName: "Cursor",
      requests: 4,
      tokens: 1400,
      cost: 0.35,
      sharePercent: 28,
    },
  ],
};

describe("daily report email", () => {
  test("includes deep link with date and settings opt-out", () => {
    const built = buildDailyReportEmail({ report, recipientName: "Dinuda" });
    assert.match(built.subject, /Your UseJunction day/);
    assert.match(built.html, /Open today's report/);
    assert.match(built.url, /\/activity\?scope=you&date=2026-07-21#reports/);
    assert.match(built.html, /\/settings/);
    assert.match(built.text, /Manage email reports|Turn off daily emails/);
  });

  test("includes plans used, acceptance, breakdown, logo, and email-safe chart", () => {
    const built = buildDailyReportEmail({ report, recipientName: "Dinuda" });
    assert.match(built.html, /Good evening, Dinuda/);
    assert.match(built.html, /usejunction\.png/);
    assert.match(built.html, /alt="UseJunction"/);
    assert.match(built.html, /Plans used/);
    assert.match(built.html, /42%/);
    assert.match(built.html, /Acceptance/);
    assert.match(built.html, /61%/);
    assert.match(built.html, /productive effectivity/);
    assert.match(built.html, /Breakdown/);
    assert.match(built.html, /ChatGPT/);
    assert.match(built.html, /72% of spend/);
    assert.match(built.html, /#e5ec67/);
    assert.doesNotMatch(built.html, /<svg/);
  });

  test("column chart encodes peak bar", () => {
    const html = buildEmailColumnChartHtml(report.series, "cost");
    assert.match(html, /height="\d+"/);
    assert.match(html, /14:00|18:00/);
  });

  test("team weekly report links with period=week", () => {
    const built = buildDailyReportEmail({
      report: {
        ...report,
        kind: "org",
        period: "week",
        localDate: "2026-07-26",
        weekStart: "2026-07-20",
        weekEnd: "2026-07-26",
        title: "Team week.",
        subtitle: "Acme · 2026-07-20 – 2026-07-26 · Asia/Colombo",
        membersActive: 3,
      },
    });
    assert.match(built.subject, /Team week/);
    assert.match(built.url, /\/activity\?scope=team&date=2026-07-26&period=week#reports/);
    assert.match(built.html, /Open this week's report/);
    assert.match(built.html, /Sent Sundays at 19:00/);
    assert.match(built.html, /This week/);
    assert.doesNotMatch(built.url, /scope=you/);
  });
});

describe("daily report send email", () => {
  test("uses plain text body with attachment notice", () => {
    const text = buildReportEmailText({
      report,
      recipientName: "Dinuda",
      settingsUrl: "https://app.usejunction.com/settings",
    });
    assert.match(text, /^Hi Dinuda,/);
    assert.match(text, /attached as a PDF/);
    assert.match(text, /Manage email reports: https:\/\/app\.usejunction\.com\/settings/);
    assert.doesNotMatch(text, /<html/i);
    assert.doesNotMatch(text, /Open today's report/);
  });

  test("reports sender uses configured address", () => {
    const prev = process.env.REPORTS_EMAIL_FROM;
    process.env.REPORTS_EMAIL_FROM = "UseJunction <reporting@usejunction.dev>";
    try {
      assert.equal(reportsEmailFrom(), "UseJunction <reporting@usejunction.dev>");
    } finally {
      if (prev) process.env.REPORTS_EMAIL_FROM = prev;
      else delete process.env.REPORTS_EMAIL_FROM;
    }
  });
});

describe("daily report PDF document", () => {
  test("builds polished PDF HTML with SVG area chart and KPIs", () => {
    const pdf = buildDailyReportPdfHtml({
      report,
      recipientName: "Dinuda",
      appOrigin: "https://app.usejunction.com",
    });
    assert.match(pdf.filename, /usejunction-day-2026-07-21\.pdf/);
    assert.match(pdf.subject, /Your UseJunction day/);
    assert.match(pdf.html, /Good evening, Dinuda/);
    assert.match(pdf.html, /<svg/);
    assert.match(pdf.html, /linearGradient/);
    assert.match(pdf.html, /Plans used/);
    assert.match(pdf.html, /Acceptance/);
    assert.match(pdf.html, /Breakdown/);
    assert.match(pdf.html, /ChatGPT/);
    assert.match(pdf.html, /@page \{ size: A4/);
  });

  test("SVG area chart includes peak halo", () => {
    const svg = buildPdfAreaChartSvg(report.series, "cost");
    assert.match(svg, /<svg/);
    assert.match(svg, /circle/);
    assert.match(svg, /#08758a/);
  });
});
