import type {
  DailyReportPayload,
  DailyReportSeriesPoint,
  ReportChartMetric,
} from "@/lib/reports/daily-report";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import {
  buildEmailWowWeekStripHtml,
  wowStripMetricLabel,
} from "@/lib/email/wow-week-strip-render";
import type { RhythmMetric } from "@/lib/reports/wow-week-strip";

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
  if (report.wowStrip) return report.wowStrip.metricDefault;
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
      <td height="${barH}" bgcolor="${fill}" style="height:${barH}px;background-color:${fill};font-size:0;line-height:0;">
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
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${brand.wash};">
    <tr>
      <td align="center" style="padding:22px 12px;">
        <div style="font-size:20px;font-weight:600;color:${brand.charcoal};line-height:1.15;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(value)}</div>
        <div style="margin-top:8px;font-size:12px;color:${brand.muted};line-height:1.3;">${escapeHtml(label)}</div>
      </td>
    </tr>
  </table>
</td>`;
}

function sectionTitle(text: string, marginTop = 0) {
  return `<div style="margin-top:${marginTop}px;font-size:20px;font-weight:600;color:${brand.charcoal};line-height:1.35;letter-spacing:-0.015em;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(text)}</div>`;
}

function sectionSubtitle(text: string) {
  return `<p style="margin:8px 0 0;font-size:14px;line-height:1.55;color:${brand.muted};">${escapeHtml(text)}</p>`;
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
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${brand.track};">
            <tr>
              <td width="${width}%" bgcolor="${brand.teal}" style="height:6px;background-color:${brand.teal};font-size:0;line-height:0;">
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

function toolUsageMeta(
  tool: {
    requests: number;
    tokens: number;
    tokenSharePercent: number;
    dayPlanUsedPercent?: number | null;
  },
  isDaily: boolean,
): string {
  const parts: string[] = [];
  if (isDaily && tool.dayPlanUsedPercent != null) {
    parts.push(`${formatPct(tool.dayPlanUsedPercent, 0)} of today's plan`);
  }
  if (tool.tokens <= 0 && tool.requests > 0) {
    parts.push(`${formatCompactNumber(tool.requests)} requests · tokens not reported`);
  } else {
    parts.push(`${formatCompactNumber(tool.requests)} requests · ${formatCompactNumber(tool.tokens)} tokens`);
    if (!isDaily || tool.dayPlanUsedPercent == null) {
      parts.push(`${formatPct(tool.tokenSharePercent, 0)} of tokens`);
    }
  }
  return parts.join(" · ");
}

function buildInsightBits(report: DailyReportPayload, isTeamWeek: boolean): string[] {
  const prior = isTeamWeek ? "week" : "yesterday at 19:00";
  const bits: string[] = [];
  const tokensDelta = report.kpis.tokensDeltaPct;
  if (tokensDelta != null) {
    bits.push(`${tokensDelta >= 0 ? "+" : ""}${tokensDelta.toFixed(0)}% tokens vs ${prior}`);
  } else if (report.kpis.costDeltaPct != null) {
    const d = report.kpis.costDeltaPct;
    bits.push(`${d >= 0 ? "+" : ""}${d.toFixed(0)}% spend vs ${prior}`);
  } else if (!isTeamWeek && report.kpis.tokens <= 0 && report.kpis.requests <= 0) {
    bits.push("Quiet day so far");
  }
  if (report.plan) {
    const pct = report.plan.usedPercent != null ? ` at ${report.plan.usedPercent.toFixed(0)}% used` : "";
    bits.push(`Plans are ${report.plan.statusLabel.toLowerCase()}${pct}`);
  } else if (report.topTools[0]) {
    bits.push(`${report.topTools[0].displayName} led activity`);
  }
  if (bits.length === 0) {
    bits.push(isTeamWeek ? "Here’s how the team used AI tools this week" : "Here’s how you used AI tools today");
  }
  return bits;
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

  const spend = formatUsd(report.kpis.cost);
  const tokens = formatCompactNumber(report.kpis.tokens);
  const requests = formatCompactNumber(report.kpis.requests);
  const planPct = report.plan?.usedPercent != null ? formatPct(report.plan.usedPercent, 0) : "—";
  const planStatus = report.plan?.statusLabel ?? "No quota data";

  const insightBits = buildInsightBits(report, isTeamWeek);
  const hasDelta =
    report.kpis.tokensDeltaPct != null || report.kpis.costDeltaPct != null;

  const cta = isTeamWeek ? "Open this week's report" : "Open today's report";
  const optOut = isTeamWeek ? "Turn off weekly team emails" : "Turn off daily emails";
  const sentNote = isTeamWeek
    ? `Sent Sundays at 19:00 in ${report.timeZone}.`
    : `Sent at 19:00 in ${report.timeZone}.`;

  const metric = seriesMetric(report);
  const useStrip = report.wowStrip != null;
  const chartHtml = useStrip
    ? buildEmailWowWeekStripHtml(report.wowStrip!, metric as RhythmMetric)
    : buildEmailColumnChartHtml(
        report.series.length ? report.series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }],
        metric,
      );
  const chartLegend = useStrip
    ? wowStripMetricLabel(metric as RhythmMetric)
    : metric === "tokens"
      ? "Tokens · key moments"
      : metric === "cost"
        ? "Spend · key moments"
        : "Requests · key moments";

  const planToolRows =
    report.plan && report.plan.tools.length > 0
      ? report.plan.tools
          .map((tool, index) =>
            breakdownRow(
              tool.displayName,
              "Billing cycle",
              tool.statusLabel,
              tool.usedPercent != null ? formatPct(tool.usedPercent, 0) : "—",
              tool.usedPercent ?? 0,
              index === report.plan!.tools.length - 1,
            ),
          )
          .join("")
      : "";

  const planBlock = report.plan
    ? `${sectionTitle("Plan status")}
              <div style="margin-top:10px;font-size:18px;font-weight:600;color:${brand.charcoal};line-height:1.4;letter-spacing:-0.015em;font-family:Inter,Helvetica,Arial,sans-serif;">${escapeHtml(planStatus)}${report.plan.usedPercent != null ? ` · ${escapeHtml(planPct)} this cycle` : ""}</div>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:${brand.muted};">${escapeHtml(report.plan.hint ?? (report.plan.withinAllowance ? "Usage is within your included plan allowance." : "Check seats and quotas before the next cycle."))}</p>
              ${planToolRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;">${planToolRows}</table>` : ""}`
    : `${sectionTitle("Plan status")}
              <div style="margin-top:10px;font-size:18px;font-weight:600;color:${brand.charcoal};line-height:1.4;">No plan signal yet.</div>
              <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:${brand.muted};">Connect a device or wait for the next quota reading to see if you’re within allowance.</p>`;

  const usagePeriodLabel = isTeamWeek ? "this week" : "today";
  const usageTitle = isTeamWeek ? "Usage by tool" : "Usage by tool today";
  const breakdownRows =
    report.topTools.length > 0
      ? report.topTools
          .map((tool, index) => {
            const barPct =
              !isTeamWeek && tool.dayPlanUsedPercent != null
                ? tool.dayPlanUsedPercent
                : tool.tokenSharePercent || tool.sharePercent || (tool.requests > 0 ? 3 : 0);
            return breakdownRow(
              tool.displayName,
              toolUsageMeta(tool, !isTeamWeek),
              tool.tokens > 0
                ? `${formatCompactNumber(tool.tokens)} tok`
                : tool.requests > 0
                  ? `${formatCompactNumber(tool.requests)} req`
                  : "0 tok",
              !isTeamWeek && tool.dayPlanUsedPercent != null
                ? `${formatPct(tool.dayPlanUsedPercent, 0)} of plan`
                : formatUsd(tool.cost),
              barPct,
              index === report.topTools.length - 1,
            );
          })
          .join("")
      : `<tr><td style="padding:16px 0;color:${brand.muted};font-size:14px;">No tool activity ${escapeHtml(usagePeriodLabel)}.</td></tr>`;

  const insightHtml = insightBits
    .map((bit, i) => {
      const escaped = escapeHtml(bit);
      if (i === 0 && hasDelta) {
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
    report.plan ? `Plan status: ${planStatus}${report.plan.usedPercent != null ? ` (${planPct} used)` : ""}` : "",
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
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:${brand.white};border:1px solid ${brand.border};overflow:hidden;">

        <!-- Logo -->
        <tr>
          <td style="padding:36px 40px 0;">
            <a href="${escapeHtml(homeUrl)}" style="text-decoration:none;">
              <img src="${escapeHtml(logoUrl)}" width="198" height="48" alt="UseJunction" style="display:block;border:0;width:198px;height:48px;max-width:55%;" />
            </a>
          </td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <div style="margin-top:4px;font-size:32px;font-weight:600;color:${brand.charcoal};font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.03em;line-height:1.12;">
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
            ${
              useStrip
                ? ""
                : `<div style="text-align:center;margin-top:16px;font-size:12px;color:${brand.muted};letter-spacing:0.01em;">
              <span style="display:inline-block;width:7px;height:7px;background:${brand.teal};margin-right:7px;vertical-align:middle;"></span>${escapeHtml(chartLegend)}
            </div>`
            }
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
                ${metricTile(planPct, "Plan usage")}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Plan status + usage breakdown -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <div style="border-top:1px solid ${brand.border};padding-top:32px;">
              ${planBlock}
              ${sectionTitle(usageTitle, 32)}
              ${!isTeamWeek ? sectionSubtitle("Share of each tool's daily plan allowance.") : sectionSubtitle(`Activity across ${usagePeriodLabel}.`)}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
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
