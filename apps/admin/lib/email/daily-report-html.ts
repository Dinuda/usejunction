import type {
  DailyReportPayload,
  DailyReportSeriesPoint,
  ReportChartMetric,
} from "@/lib/reports/daily-report";
import { formatCompactNumber, formatUsd } from "@/lib/format";

/** Brand tokens mirrored from globals.css — email-safe solid colors only. */
const brand = {
  teal: "#08758a",
  tealMuted: "#a8d0d8",
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

/** Prefer tokens so the chart reads as activity over time, not a rising bill. */
export function seriesMetric(report: DailyReportPayload): ReportChartMetric {
  if (report.series.some((p) => p.tokens > 0)) return "tokens";
  if (report.series.some((p) => p.cost > 0)) return "cost";
  return "requests";
}

function metricValue(point: DailyReportSeriesPoint, metric: ReportChartMetric) {
  if (metric === "tokens") return point.tokens;
  if (metric === "cost") return point.cost;
  return point.requests;
}

/**
 * Table-based column chart — avoids position:absolute / SVG (unreliable in Gmail/Outlook).
 */
export function buildEmailColumnChartHtml(
  series: DailyReportSeriesPoint[],
  metric: ReportChartMetric,
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
        <div style="font-size:20px;font-weight:600;color:${brand.charcoal};line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(value)}</div>
        <div style="margin-top:8px;font-size:12px;color:${brand.muted};line-height:1.3;">${escapeHtml(label)}</div>
      </td>
    </tr>
  </table>
</td>`;
}

function breakdownRow(
  name: string,
  meta: string,
  tokensLabel: string,
  cost: string,
  sharePercent: number,
  isLast: boolean,
) {
  const width = Math.max(3, Math.min(100, Math.round(sharePercent)));
  const border = isLast ? "none" : `1px solid ${brand.border}`;
  return `<tr>
  <td style="padding:18px 0;border-bottom:${border};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td style="font-size:15px;font-weight:600;color:${brand.charcoal};padding-right:12px;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(name)}</td>
        <td align="right" style="font-size:14px;font-weight:600;color:${brand.charcoal};font-variant-numeric:tabular-nums;white-space:nowrap;font-family:Inter,Helvetica,Arial,sans-serif;">
          ${escapeHtml(tokensLabel)}&nbsp;&nbsp;<span style="color:${brand.muted};">${escapeHtml(cost)}</span>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:6px;font-size:13px;color:${brand.muted};line-height:1.45;">${escapeHtml(meta)}</td>
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

function buildBreakdownNarrative(report: DailyReportPayload, windowLabel: string): string {
  const tools = report.topTools;
  if (tools.length === 0) {
    return `No tool activity ${windowLabel}. Open the app for live usage.`;
  }
  const lead = tools[0]!;
  const parts = tools.slice(0, 3).map((tool) => {
    return `${tool.displayName} (${formatCompactNumber(tool.tokens)} tokens, ${formatUsd(tool.cost)})`;
  });
  if (tools.length === 1) {
    return `${lead.displayName} accounted for all ${formatCompactNumber(lead.tokens)} tokens and ${formatUsd(lead.cost)} ${windowLabel}.`;
  }
  return `${parts.join(", ")}${tools.length > 3 ? `, and ${tools.length - 3} more` : ""}.`;
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
  const tokens = formatCompactNumber(report.kpis.tokens);
  const requests = formatCompactNumber(report.kpis.requests);
  const topTool = report.topTools[0];
  const fourthLabel = topTool ? "Top tool" : report.kind === "org" ? "Active members" : "Tools";
  const fourthValue = topTool
    ? topTool.displayName
    : formatCompactNumber(report.kind === "org" ? report.membersActive ?? 0 : report.kpis.tools);

  const daysInWeek =
    report.weekStart && report.weekEnd
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${report.weekEnd}T00:00:00Z`) - Date.parse(`${report.weekStart}T00:00:00Z`)) /
              86_400_000,
          ) + 1,
        )
      : 7;
  const avgDailySpend = isTeamWeek ? formatUsd(report.kpis.cost / daysInWeek) : null;
  const avgDailyTokens = isTeamWeek ? formatCompactNumber(report.kpis.tokens / daysInWeek) : null;

  const tokensDelta = report.kpis.tokensDeltaPct;
  const tokensDeltaText =
    tokensDelta === null
      ? null
      : `${tokensDelta >= 0 ? "+" : ""}${tokensDelta.toFixed(0)}% tokens vs the prior ${isTeamWeek ? "week" : "day"}`;

  const costDelta = report.kpis.costDeltaPct;
  const costDeltaText =
    costDelta === null
      ? null
      : `${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(0)}% spend vs the prior ${isTeamWeek ? "week" : "day"}`;

  const insightBits: string[] = [`${tokens} tokens and ${spend} across ${requests} requests ${windowLabel}`];
  if (tokensDeltaText) insightBits.push(tokensDeltaText);
  else if (costDeltaText) insightBits.push(costDeltaText);
  if (topTool) {
    insightBits.push(`${topTool.displayName} led with ${formatPct(topTool.tokenSharePercent, 0)} of tokens`);
  }

  const summaryHeading = isTeamWeek
    ? `${tokens} tokens and ${spend} this week${avgDailyTokens && avgDailySpend ? `, averaging ${avgDailyTokens} tokens / ${avgDailySpend} per day` : ""}.`
    : `${tokens} tokens and ${spend} today.`;
  const summaryDetail = buildBreakdownNarrative(report, windowLabel);

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
  const chartLegend =
    metric === "tokens"
      ? "Tokens · key moments"
      : metric === "cost"
        ? "Spend · key moments"
        : "Requests · key moments";

  const breakdownRows =
    report.topTools.length > 0
      ? report.topTools
          .map((tool, index) => {
            const costPer1k =
              tool.tokens > 0 ? formatUsd((tool.cost / tool.tokens) * 1000) : null;
            return breakdownRow(
              tool.displayName,
              `${formatCompactNumber(tool.requests)} requests · ${formatPct(tool.tokenSharePercent, 0)} of tokens · ${formatPct(tool.sharePercent, 0)} of spend${costPer1k ? ` · ${costPer1k} / 1K tok` : ""}`,
              `${formatCompactNumber(tool.tokens)} tok`,
              formatUsd(tool.cost),
              tool.tokenSharePercent || tool.sharePercent,
              index === report.topTools.length - 1,
            );
          })
          .join("")
      : `<tr><td style="padding:16px 0;color:${brand.muted};font-size:14px;">No tool breakdown for this period.</td></tr>`;

  const insightHtml = insightBits
    .map((bit, i) => {
      const escaped = escapeHtml(bit);
      if (i === 1 && (tokensDeltaText || costDeltaText)) {
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
    `Tokens: ${report.kpis.tokens}`,
    `Requests: ${report.kpis.requests}`,
    `Spend: ${formatUsd(report.kpis.cost)}`,
    "",
    ...report.topTools.map(
      (t) =>
        `${t.displayName}: ${formatCompactNumber(t.tokens)} tokens · ${formatUsd(t.cost)} (${formatPct(t.tokenSharePercent, 0)} of tokens)`,
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
<body style="margin:0;padding:0;background:${brand.page};font-family:Inter,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.page};padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:${brand.white};border:1px solid ${brand.border};border-radius:20px;overflow:hidden;">

        <!-- Logo -->
        <tr>
          <td style="padding:36px 40px 0;">
            <a href="${escapeHtml(homeUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="132" height="32" alt="UseJunction" style="display:block;border:0;width:132px;height:32px;max-width:40%;" />
            </a>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${brand.muted};font-weight:600;">
              ${escapeHtml(eyebrow)} · ${escapeHtml(audience)}
            </div>
            <div style="margin-top:18px;font-size:32px;font-weight:600;color:${brand.charcoal};font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.03em;line-height:1.12;">
              ${escapeHtml(greeting)}.
            </div>
            <p style="margin:18px 0 0;font-size:15px;line-height:1.7;color:${brand.muted};max-width:480px;">
              ${insightHtml}.
            </p>
          </td>
        </tr>

        <!-- Chart -->
        <tr>
          <td style="padding:32px 40px 4px;">
            ${chartHtml}
            <div style="text-align:center;margin-top:16px;font-size:12px;color:${brand.muted};letter-spacing:0.01em;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${brand.teal};margin-right:7px;vertical-align:middle;"></span>${escapeHtml(chartLegend)}
            </div>
          </td>
        </tr>

        <!-- KPI tiles -->
        <tr>
          <td style="padding:32px 34px 8px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                ${metricTile(spend, isTeamWeek ? "Period spend" : "Today's spend")}
                ${metricTile(tokens, "Tokens")}
                ${metricTile(requests, "Requests")}
                ${metricTile(fourthValue, fourthLabel)}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary + breakdown -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <div style="border-top:1px solid ${brand.border};padding-top:32px;">
              <div style="font-size:18px;font-weight:600;color:${brand.charcoal};line-height:1.4;letter-spacing:-0.015em;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(summaryHeading)}</div>
              <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:${brand.muted};">${escapeHtml(summaryDetail)}</p>
              <div style="margin-top:32px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${brand.muted};font-weight:600;">Breakdown by tool</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:4px;">
                ${breakdownRows}
              </table>
            </div>
          </td>
        </tr>

        <!-- CTA + footer -->
        <tr>
          <td style="padding:28px 40px 40px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;color:${brand.teal};text-decoration:underline;text-underline-offset:3px;font-weight:600;font-size:14px;font-family:Inter,Helvetica,Arial,sans-serif;">
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
  metric: ReportChartMetric,
): string {
  return buildEmailColumnChartHtml(series, metric);
}
