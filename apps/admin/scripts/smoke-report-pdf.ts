import { writeFileSync } from "node:fs";
import { buildDailyReportPdfHtml } from "../lib/email/daily-report-pdf";
import { closePdfBrowser, renderHtmlToPdf } from "../lib/email/render-pdf";
import type { DailyReportPayload } from "../lib/reports/daily-report";
import { buildWowWeekStrip, type WowDayTotals } from "../lib/reports/wow-week-strip";

const currentByDate = new Map<string, WowDayTotals>([
  ["2026-07-20", { tokens: 12_000_000, cost: 2, requests: 10 }],
  ["2026-07-21", { tokens: 141_000_000, cost: 112.34, requests: 1200 }],
]);
const priorByDate = new Map<string, WowDayTotals>([
  ["2026-07-13", { tokens: 8_000_000, cost: 1.5, requests: 8 }],
  ["2026-07-14", { tokens: 70_000_000, cost: 40, requests: 400 }],
]);

const wowStrip = buildWowWeekStrip({
  asOfLocalDate: "2026-07-21",
  timeZone: "Asia/Colombo",
  weekStart: "2026-07-20",
  weekEnd: "2026-07-26",
  currentByDate,
  priorByDate,
  topToolDisplayName: "ChatGPT",
  todayPartial: true,
});

const report: DailyReportPayload = {
  kind: "personal",
  period: "day",
  localDate: "2026-07-21",
  timeZone: "Asia/Colombo",
  title: "Your day.",
  subtitle: "2026-07-21 · Asia/Colombo",
  kpis: {
    requests: 1200,
    tokens: 374000000,
    cost: 112.34,
    tools: 2,
    requestsDeltaPct: 100,
    tokensDeltaPct: 100,
    costDeltaPct: 100,
    planUsedPercent: 27,
    acceptancePercent: 100,
  },
  plan: {
    usedPercent: 27,
    statusLabel: "Within allowance",
    withinAllowance: true,
    hint: "Usage is well within the included plan allowance",
    tools: [
      {
        toolName: "chatgpt",
        displayName: "ChatGPT",
        usedPercent: 31,
        statusLabel: "Within allowance",
        withinAllowance: true,
      },
      {
        toolName: "cursor",
        displayName: "Cursor",
        usedPercent: 23,
        statusLabel: "Within allowance",
        withinAllowance: true,
      },
    ],
  },
  series: wowStrip.cells.map((c) => ({
    label: c.label,
    requests: c.requests,
    tokens: c.tokens,
    cost: c.cost,
  })),
  wowStrip,
  topTools: [
    {
      toolName: "chatgpt",
      displayName: "ChatGPT",
      requests: 1200,
      tokens: 294100000,
      cost: 86.88,
      sharePercent: 77,
      tokenSharePercent: 79,
    },
    {
      toolName: "cursor",
      displayName: "Cursor",
      requests: 101,
      tokens: 79900000,
      cost: 25.46,
      sharePercent: 23,
      tokenSharePercent: 21,
    },
  ],
};

async function main() {
  const pdf = buildDailyReportPdfHtml({
    report,
    recipientName: "Dinuda",
    appOrigin: "http://localhost:3001",
  });
  console.log("rendering…");
  const buf = await renderHtmlToPdf(pdf.html);
  writeFileSync("/tmp/usejunction-day-smoke.pdf", buf);
  await closePdfBrowser();
  console.log(
    JSON.stringify({
      ok: true,
      bytes: buf.byteLength,
      filename: pdf.filename,
      magic: buf.subarray(0, 5).toString("utf8"),
      out: "/tmp/usejunction-day-smoke.pdf",
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
