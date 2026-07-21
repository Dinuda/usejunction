import type { DailyReportPayload, DailyReportSeriesPoint } from "@/lib/reports/daily-report";
import { formatCompactNumber, formatUsd } from "@/lib/format";

/** Brand tokens mirrored from globals.css — email-safe solid colors only. */
const brand = {
  teal: "#08758a",
  tealMuted: "#a8d0d8",
  yellow: "#e5ec67",
  yellowDark: "#838a20",
  charcoal: "#111210",
  muted: "#6b6a64",
  border: "#e8e8e3",
  wash: "#f6f6f3",
  page: "#f0efeb",
  white: "#ffffff",
  track: "#ecece8",
} as const;

const CHART_HEIGHT = 140;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function reportEmailDeepLink(report: DailyReportPayload) {
  const isTeamWeek = report.kind === "org" && report.period === "week";
  const params = new URLSearchParams();
  if (report.kind === "org") {
    params.set("scope", "team");
    params.set("date", report.localDate);
    if (isTeamWeek) params.set("period", "week");
  } else {
    params.set("scope", "you");
    params.set("date", report.localDate);
  }
  return `/activity?${params.toString()}#reports`;
}

function seriesMetric(report: DailyReportPayload): "cost" | "requests" {
  return report.series.some((p) => p.cost > 0) ? "cost" : "requests";
}

function metricValue(point: DailyReportSeriesPoint, metric: "cost" | "requests") {
  return metric === "cost" ? point.cost : point.requests;
}

/**
 * Table-based column chart — avoids position:absolute / SVG (unreliable in Gmail/Outlook).
 */
export function buildEmailColumnChartHtml(
  series: DailyReportSeriesPoint[],
  metric: "cost" | "requests",
): string {
  const points = series.length > 0 ? series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }];
  const maxCols = 12;
  const step = Math.max(1, Math.ceil(points.length / maxCols));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const values = sampled.map((p) => metricValue(p, metric));
  const max = Math.max(...values, 1);
  const colWidth = Math.floor(100 / sampled.length);

  let peakI = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[peakI]!) peakI = i;
  }

  const bars = sampled
    .map((point, i) => {
      const v = values[i] ?? 0;
      const barH = Math.max(6, Math.round((v / max) * CHART_HEIGHT));
      const spacerH = Math.max(0, CHART_HEIGHT - barH);
      const isPeak = i === peakI && v > 0;
      const fill = isPeak ? brand.teal : brand.tealMuted;
      return `<td width="${colWidth}%" valign="bottom" align="center" style="padding:0 3px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
    <tr><td height="${spacerH}" style="font-size:0;line-height:0;height:${spacerH}px;">&nbsp;</td></tr>
    <tr>
      <td height="${barH}" bgcolor="${fill}" style="height:${barH}px;background-color:${fill};font-size:0;line-height:0;border-radius:4px 4px 0 0;">
        <div style="height:${barH}px;line-height:${barH}px;font-size:0;">&nbsp;</div>
      </td>
    </tr>
  </table>
  <div style="padding-top:10px;font-size:10px;color:${brand.muted};line-height:1.2;">${escapeHtml(point.label)}</div>
</td>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
  <tr>${bars}</tr>
</table>`;
}

function metricTile(value: string, label: string) {
  return `<td width="25%" valign="top" style="padding:6px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${brand.wash};border-radius:14px;">
    <tr>
      <td align="center" style="padding:22px 12px;">
        <div style="font-size:20px;font-weight:700;color:${brand.charcoal};line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;">${escapeHtml(value)}</div>
        <div style="margin-top:8px;font-size:12px;color:${brand.muted};line-height:1.3;">${escapeHtml(label)}</div>
      </td>
    </tr>
  </table>
</td>`;
}

function breakdownRow(name: string, meta: string, cost: string, sharePercent: number, isLast: boolean) {
  const width = Math.max(3, Math.min(100, Math.round(sharePercent)));
  const border = isLast ? "none" : `1px solid ${brand.border}`;
  return `<tr>
  <td style="padding:16px 0;border-bottom:${border};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td style="font-size:15px;font-weight:600;color:${brand.charcoal};padding-right:12px;">${escapeHtml(name)}</td>
        <td align="right" style="font-size:15px;font-weight:600;color:${brand.charcoal};font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(cost)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:5px;font-size:13px;color:${brand.muted};line-height:1.4;">${escapeHtml(meta)} · ${escapeHtml(formatPct(sharePercent, 0))} of spend</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:10px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${brand.track};border-radius:999px;">
            <tr>
              <td width="${width}%" bgcolor="${brand.teal}" style="height:6px;background-color:${brand.teal};font-size:0;line-height:0;border-radius:999px;">
                <div style="height:6px;font-size:0;line-height:0;">&nbsp;</div>
              </td>
              <td width="${100 - width}%" style="font-size:0;line-height:0;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

export function buildDailyReportEmailDocument(input: {
  report: DailyReportPayload;
  recipientName?: string | null;
  /** Absolute app origin, e.g. https://app.usejunction.com */
  appOrigin: string;
}) {
  const { report } = input;
  const origin = input.appOrigin.replace(/\/$/, "");
  const isTeamWeek = report.kind === "org" && report.period === "week";
  const path = reportEmailDeepLink(report);
  const url = `${origin}${path}`;
  const settingsUrl = `${origin}/settings`;
  const logoUrl = `${origin}/usejunction.png`;
  const homeUrl = `${origin}/`;

  const subject = isTeamWeek
    ? `Team week · ${report.weekStart ?? report.localDate} – ${report.weekEnd ?? report.localDate}`
    : report.kind === "org"
      ? `Team day · ${report.localDate}`
      : `Your UseJunction day · ${report.localDate}`;

  const first = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Good evening, ${first}` : "Good evening";
  const windowLabel = isTeamWeek ? "this week" : "today";
  const eyebrow = isTeamWeek ? "This week" : "Today";
  const audience = report.kind === "org" ? "Team" : "You";

  const spend = formatUsd(report.kpis.cost);
  const requests = formatCompactNumber(report.kpis.requests);
  const planUsed = formatPct(report.kpis.planUsedPercent, 0);
  const acceptance = formatPct(report.kpis.acceptancePercent, 0);
  const topTool = report.topTools[0];
  const fourthLabel = topTool ? "Top tool" : report.kind === "org" ? "Active members" : "Tools";
  const fourthValue = topTool
    ? topTool.displayName
    : formatCompactNumber(report.kind === "org" ? report.membersActive ?? 0 : report.kpis.tools);

  const daysInWeek =
    report.weekStart && report.weekEnd
      ? Math.max(1, Math.round((Date.parse(`${report.weekEnd}T00:00:00Z`) - Date.parse(`${report.weekStart}T00:00:00Z`)) / 86_400_000) + 1)
      : 7;
  const avgDaily = isTeamWeek ? formatUsd(report.kpis.cost / daysInWeek) : null;

  const deltaPct = report.kpis.costDeltaPct;
  const deltaText =
    deltaPct === null
      ? null
      : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs the prior ${isTeamWeek ? "week" : "day"}`;

  const insightBits: string[] = [`${spend} across ${requests} requests ${windowLabel}.`];
  if (deltaText) insightBits.push(deltaText);
  if (report.kpis.planUsedPercent != null) insightBits.push(`plans at ${planUsed} used`);
  if (report.kpis.acceptancePercent != null) {
    insightBits.push(`${acceptance} acceptance (productive effectivity)`);
  }

  const summaryHeading = isTeamWeek
    ? `${spend} spent this week${avgDaily ? `, averaging ${avgDaily} per day` : ""}.`
    : `${spend} spent today.`;
  const summaryDetail = topTool
    ? `${topTool.displayName} led with ${formatCompactNumber(topTool.requests)} requests and ${formatUsd(topTool.cost)} (${formatPct(topTool.sharePercent, 0)} of spend).`
    : "Open the full report in the app for charts and tool detail.";

  const cta = isTeamWeek ? "Open this week's report" : "Open today's report";
  const optOut = isTeamWeek ? "Turn off weekly team emails" : "Turn off daily emails";
  const sentNote = isTeamWeek
    ? `Sent Sundays at 19:00 in ${report.timeZone}.`
    : `Sent at 19:00 in ${report.timeZone}.`;

  const metric = seriesMetric(report);
  const chartHtml = buildEmailColumnChartHtml(
    report.series.length ? report.series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }],
    metric,
  );
  const chartLegend = metric === "cost" ? "Daily spend · key moments" : "Requests · key moments";

  const breakdownRows =
    report.topTools.length > 0
      ? report.topTools
          .map((tool, index) =>
            breakdownRow(
              tool.displayName,
              `${formatCompactNumber(tool.requests)} requests · ${formatCompactNumber(tool.tokens)} tokens`,
              formatUsd(tool.cost),
              tool.sharePercent,
              index === report.topTools.length - 1,
            ),
          )
          .join("")
      : `<tr><td style="padding:16px 0;color:${brand.muted};font-size:14px;">No tool breakdown for this period.</td></tr>`;

  const insightHtml = insightBits
    .map((bit, i) => {
      const escaped = escapeHtml(bit);
      if (i === 1 && deltaText) {
        return `<span style="color:${brand.charcoal};text-decoration:underline;text-underline-offset:3px;text-decoration-color:${brand.border};">${escaped}</span>`;
      }
      return escaped;
    })
    .join(" · ");

  const text = [
    "UseJunction",
    `${greeting}.`,
    "",
    insightBits.join(" · "),
    report.kpis.planUsedPercent != null ? `Plans used: ${planUsed}` : "",
    report.kpis.acceptancePercent != null ? `Acceptance: ${acceptance}` : "",
    `Requests: ${report.kpis.requests}`,
    `Spend: ${formatUsd(report.kpis.cost)}`,
    "",
    ...report.topTools.map(
      (t) => `${t.displayName}: ${formatUsd(t.cost)} (${formatPct(t.sharePercent, 0)})`,
    ),
    "",
    `Open the full report: ${url}`,
    `${optOut}: ${settingsUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(report.title)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.page};font-family:DM Sans,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.page};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:${brand.white};border:1px solid ${brand.border};border-radius:20px;overflow:hidden;">

        <!-- Logo -->
        <tr>
          <td style="padding:28px 32px 0;">
            <a href="${escapeHtml(homeUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="132" height="32" alt="UseJunction" style="display:block;border:0;width:132px;height:32px;max-width:40%;" />
            </a>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${brand.muted};font-weight:600;">
              <span style="display:inline-block;width:8px;height:8px;background:${brand.yellow};margin-right:8px;vertical-align:middle;"></span>${escapeHtml(eyebrow)} · ${escapeHtml(audience)}
            </div>
            <div style="margin-top:16px;font-size:30px;font-weight:700;color:${brand.charcoal};font-family:Figtree,Helvetica,Arial,sans-serif;letter-spacing:-0.03em;line-height:1.15;">
              ${escapeHtml(greeting)}.
            </div>
            <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:${brand.muted};max-width:460px;">
              ${insightHtml}.
            </p>
          </td>
        </tr>

        <!-- Chart -->
        <tr>
          <td style="padding:28px 32px 4px;">
            ${chartHtml}
            <div style="text-align:center;margin-top:14px;font-size:12px;color:${brand.muted};letter-spacing:0.01em;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${brand.teal};margin-right:7px;vertical-align:middle;"></span>${escapeHtml(chartLegend)}
            </div>
          </td>
        </tr>

        <!-- KPI tiles -->
        <tr>
          <td style="padding:28px 26px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                ${metricTile(spend, "Period spend")}
                ${metricTile(planUsed, "Plans used")}
                ${metricTile(acceptance, "Acceptance")}
                ${metricTile(fourthValue, fourthLabel)}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary + breakdown -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <div style="border-top:1px solid ${brand.border};padding-top:28px;">
              <div style="font-size:18px;font-weight:700;color:${brand.charcoal};line-height:1.35;letter-spacing:-0.01em;">${escapeHtml(summaryHeading)}</div>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:${brand.muted};">${escapeHtml(summaryDetail)}</p>
              <div style="margin-top:28px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${brand.muted};font-weight:600;">Breakdown</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">
                ${breakdownRows}
              </table>
            </div>
          </td>
        </tr>

        <!-- CTA + footer -->
        <tr>
          <td style="padding:24px 32px 36px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;background:${brand.yellow};color:${brand.charcoal};text-decoration:none;padding:14px 20px;font-weight:600;font-size:14px;border:1px solid ${brand.yellowDark};border-radius:8px;">
              ${escapeHtml(cta)}
            </a>
            <div style="margin-top:22px;font-size:12px;line-height:1.6;color:${brand.muted};">
              ${escapeHtml(sentNote)}
              <a href="${escapeHtml(settingsUrl)}" style="color:${brand.teal};text-decoration:underline;">Manage email reports</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, url, settingsUrl, logoUrl };
}

/** @deprecated Prefer buildEmailColumnChartHtml — SVG is stripped by most clients. */
export function buildEmailAreaChartSvg(
  series: DailyReportSeriesPoint[],
  metric: "cost" | "requests",
): string {
  return buildEmailColumnChartHtml(series, metric);
}
