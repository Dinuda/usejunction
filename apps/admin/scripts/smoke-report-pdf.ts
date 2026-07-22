import { writeFileSync } from "node:fs";
import { buildDailyReportPdfHtml } from "../lib/email/daily-report-pdf";
import { closePdfBrowser, renderHtmlToPdf } from "../lib/email/render-pdf";
import type { DailyReportPayload } from "../lib/reports/daily-report";

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
    statusLabel: "On plan",
    onPlan: true,
    hint: "Plenty of headroom this cycle",
    tools: [
      {
        toolName: "chatgpt",
        displayName: "ChatGPT",
        usedPercent: 31,
        statusLabel: "On plan",
        onPlan: true,
      },
      {
        toolName: "cursor",
        displayName: "Cursor",
        usedPercent: 23,
        statusLabel: "On plan",
        onPlan: true,
      },
    ],
  },
  series: [
    { label: "07:00", requests: 10, tokens: 12_000_000, cost: 2 },
    { label: "09:00", requests: 12, tokens: 18_000_000, cost: 3 },
    { label: "11:00", requests: 8, tokens: 9_000_000, cost: 2 },
    { label: "13:00", requests: 15, tokens: 42_000_000, cost: 4 },
    { label: "15:00", requests: 20, tokens: 88_000_000, cost: 5 },
    { label: "17:00", requests: 18, tokens: 64_000_000, cost: 6 },
    { label: "19:00", requests: 1200, tokens: 141_000_000, cost: 112.34 },
  ],
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
