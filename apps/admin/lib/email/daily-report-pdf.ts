import fs from "node:fs";
import path from "node:path";
import type {
  DailyReportPayload,
  DailyReportSeriesPoint,
  ReportChartMetric,
} from "@/lib/reports/daily-report";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import { reportEmailDeepLink } from "@/lib/email/daily-report-html";

const brand = {
  teal: "#08758a",
  charcoal: "#111210",
  muted: "#6b6a64",
  border: "#ececea",
  wash: "#f5f5f2",
  page: "#f3f2ee",
  white: "#ffffff",
  track: "#ecece8",
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

export type { ReportChartMetric };

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

function formatAxisValue(value: number, metric: ReportChartMetric) {
  if (metric === "cost") return formatUsd(value).replace(/\.00$/, "");
  return formatCompactNumber(value);
}

function chartTitle(metric: ReportChartMetric) {
  if (metric === "tokens") return "Tokens";
  if (metric === "cost") return "Spend";
  return "Requests";
}

/** Smooth SVG area chart — Chrome PDF renders this pixel-perfect. */
export function buildPdfAreaChartSvg(
  series: DailyReportSeriesPoint[],
  metric: ReportChartMetric,
  options?: { height?: number },
): string {
  const width = 720;
  const height = options?.height ?? 200;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const points = series.length > 0 ? series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }];
  const values = points.map((p) => metricValue(p, metric));
  const max = Math.max(...values, 1);
  const n = points.length;

  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;

  // Catmull-Rom → cubic bezier for a natural area curve.
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(metricValue(p, metric)) }));
  let lineD = "";
  if (coords.length === 1) {
    lineD = `M ${coords[0]!.x} ${coords[0]!.y}`;
  } else if (coords.length === 2) {
    lineD = `M ${coords[0]!.x} ${coords[0]!.y} L ${coords[1]!.x} ${coords[1]!.y}`;
  } else {
    lineD = `M ${coords[0]!.x} ${coords[0]!.y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)]!;
      const p1 = coords[i]!;
      const p2 = coords[i + 1]!;
      const p3 = coords[Math.min(coords.length - 1, i + 2)]!;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
  }

  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const areaD = `${lineD} L ${last.x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${first.x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  let peakI = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[peakI]!) peakI = i;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = max * t;
    const y = yAt(v);
    return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="${brand.muted}" font-size="11" font-family="${FONT}">${escapeHtml(formatAxisValue(v, metric))}</text>
  <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="${brand.border}" stroke-width="1"/>`;
  });

  const xTickIdx =
    n <= 1
      ? [0]
      : n <= 5
        ? points.map((_, i) => i)
        : [0, Math.floor((n - 1) / 3), Math.floor((2 * (n - 1)) / 3), n - 1];
  const xTicks = [...new Set(xTickIdx)].map((i) => {
    const x = xAt(i);
    return `<text x="${x.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="${brand.muted}" font-size="11" font-family="${FONT}">${escapeHtml(points[i]?.label ?? "")}</text>`;
  });

  // Mark peak + any other non-zero local peaks so sparse days still read clearly.
  const dots = coords
    .map((c, i) => {
      const v = values[i]!;
      const isPeak = i === peakI && v > 0;
      const isLocal =
        v > 0 &&
        v >= (values[i - 1] ?? 0) &&
        v >= (values[i + 1] ?? 0) &&
        (i === 0 || values[i - 1]! < v || i === n - 1 || values[i + 1]! < v);
      if (!isPeak && !isLocal) return "";
      const halo = isPeak
        ? `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="11" fill="${brand.teal}" fill-opacity="0.14"/>`
        : "";
      return `${halo}<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isPeak ? 4.5 : 3}" fill="${brand.teal}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${chartTitle(metric)} chart">
  <defs>
    <linearGradient id="ujPdfArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${brand.teal}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${brand.teal}" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  ${yTicks.join("\n  ")}
  <path d="${areaD}" fill="url(#ujPdfArea)"/>
  <path d="${lineD}" fill="none" stroke="${brand.teal}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  ${dots}
  ${xTicks.join("\n  ")}
</svg>`;
}

function loadLogoDataUri(): string {
  try {
    const logoPath = path.join(process.cwd(), "public", "usejunction.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function buildInsightLine(report: DailyReportPayload, isTeamWeek: boolean): string {
  const prior = isTeamWeek ? "week" : "day";
  const parts: string[] = [];

  const tokensDelta = report.kpis.tokensDeltaPct;
  if (tokensDelta != null) {
    parts.push(
      `<span class="underline">${escapeHtml(`${tokensDelta >= 0 ? "+" : ""}${tokensDelta.toFixed(0)}% tokens vs the prior ${prior}`)}</span>`,
    );
  } else if (report.kpis.costDeltaPct != null) {
    const d = report.kpis.costDeltaPct;
    parts.push(
      `<span class="underline">${escapeHtml(`${d >= 0 ? "+" : ""}${d.toFixed(0)}% spend vs the prior ${prior}`)}</span>`,
    );
  }

  if (report.plan) {
    const pct =
      report.plan.usedPercent != null ? ` at ${report.plan.usedPercent.toFixed(0)}% used` : "";
    parts.push(`Plans are <strong>${escapeHtml(report.plan.statusLabel.toLowerCase())}</strong>${escapeHtml(pct)}`);
  } else if (report.topTools[0]) {
    parts.push(`${escapeHtml(report.topTools[0].displayName)} led activity`);
  }

  if (parts.length === 0) {
    return isTeamWeek
      ? "Here’s how the team used AI tools this week."
      : "Here’s how you used AI tools today.";
  }
  return `${parts.join(" · ")}.`;
}

/**
 * Full Chrome-print HTML for the daily/weekly report PDF.
 * Layout follows the reference: Inter, generous rhythm, area chart, KPI tiles, plan status, breakdown.
 */
export function buildDailyReportPdfHtml(input: {
  report: DailyReportPayload;
  recipientName?: string | null;
  appOrigin: string;
}): { html: string; filename: string; subject: string; url: string } {
  const { report } = input;
  const origin = input.appOrigin.replace(/\/$/, "");
  const isTeamWeek = report.kind === "org" && report.period === "week";
  const pathRel = reportEmailDeepLink(report);
  const url = `${origin}${pathRel}`;
  const settingsUrl = `${origin}/settings`;
  const logoDataUri = loadLogoDataUri();

  const subject = isTeamWeek
    ? `Team week · ${report.weekStart ?? report.localDate} – ${report.weekEnd ?? report.localDate}`
    : report.kind === "org"
      ? `Team day · ${report.localDate}`
      : `Your UseJunction day · ${report.localDate}`;

  const filename = isTeamWeek
    ? `usejunction-team-week-${report.localDate}.pdf`
    : report.kind === "org"
      ? `usejunction-team-day-${report.localDate}.pdf`
      : `usejunction-day-${report.localDate}.pdf`;

  const first = input.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Good evening, ${first}` : "Good evening";

  const spend = formatUsd(report.kpis.cost);
  const tokens = formatCompactNumber(report.kpis.tokens);
  const requests = formatCompactNumber(report.kpis.requests);
  const planPct =
    report.plan?.usedPercent != null ? formatPct(report.plan.usedPercent, 0) : "—";
  const planStatus = report.plan?.statusLabel ?? "No signal";

  const insightHtml = buildInsightLine(report, isTeamWeek);

  const metric = seriesMetric(report);
  const chartSvg = buildPdfAreaChartSvg(
    report.series.length ? report.series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }],
    metric,
    { height: isTeamWeek ? 180 : 160 },
  );
  const chartLegend = isTeamWeek
    ? metric === "tokens"
      ? "Daily tokens · key moments"
      : metric === "cost"
        ? "Daily spend · key moments"
        : "Requests · key moments"
    : metric === "tokens"
      ? "Tokens by hour · key moments"
      : metric === "cost"
        ? "Spend by hour · key moments"
        : "Requests by hour · key moments";

  const tiles = [
    { value: spend, label: isTeamWeek ? "Period spend" : "Today's spend" },
    { value: tokens, label: "Tokens" },
    { value: requests, label: "Requests" },
    { value: planPct, label: "Plan usage" },
  ];

  const planSection = report.plan
    ? `<div class="plan-block">
  <div class="section-label">Plan status</div>
  <h2>${escapeHtml(planStatus)}${report.plan.usedPercent != null ? ` · ${escapeHtml(planPct)} used` : ""}.</h2>
  <p>${escapeHtml(report.plan.hint ?? (report.plan.onPlan ? "Usage is within your included plan allowance." : "Check seats and quotas before the next cycle."))}</p>
  ${
    report.plan.tools.length > 0
      ? report.plan.tools
          .map((tool) => {
            const width =
              tool.usedPercent == null
                ? 0
                : Math.max(3, Math.min(100, Math.round(tool.usedPercent)));
            return `<div class="break-row">
  <div class="break-top">
    <span class="break-name">${escapeHtml(tool.displayName)}</span>
    <span class="break-metrics">
      <span class="break-tokens">${escapeHtml(tool.statusLabel)}</span>
      <span class="break-cost">${tool.usedPercent != null ? escapeHtml(formatPct(tool.usedPercent, 0)) : "—"}</span>
    </span>
  </div>
  <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
</div>`;
          })
          .join("")
      : ""
  }
</div>`
    : `<div class="plan-block">
  <div class="section-label">Plan status</div>
  <h2>No plan signal yet.</h2>
  <p>Connect a device or wait for the next quota reading to see if you’re on plan.</p>
</div>`;

  const breakdown =
    report.topTools.length === 0
      ? `<p class="muted">No tool activity this period.</p>`
      : report.topTools
          .slice(0, isTeamWeek ? 6 : 5)
          .map((tool) => {
            const barPct = Math.max(
              3,
              Math.min(100, Math.round(tool.tokenSharePercent || tool.sharePercent)),
            );
            return `<div class="break-row">
  <div class="break-top">
    <span class="break-name">${escapeHtml(tool.displayName)}</span>
    <span class="break-metrics">
      <span class="break-tokens">${escapeHtml(formatCompactNumber(tool.tokens))} tok</span>
      <span class="break-cost">${escapeHtml(formatUsd(tool.cost))}</span>
    </span>
  </div>
  <div class="break-meta">${escapeHtml(formatCompactNumber(tool.requests))} requests · ${escapeHtml(formatPct(tool.tokenSharePercent, 0))} of tokens</div>
  <div class="bar-track"><div class="bar-fill" style="width:${barPct}%"></div></div>
</div>`;
          })
          .join("");

  const cta = isTeamWeek ? "Open this week's report" : "Open today's report";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      overflow: hidden;
      background: ${brand.page};
      color: ${brand.charcoal};
      font-family: ${FONT};
      -webkit-font-smoothing: antialiased;
    }
    body { padding: 16px 18px; }
    .card {
      width: 100%;
      height: calc(297mm - 32px);
      margin: 0 auto;
      background: ${brand.white};
      border: 1px solid ${brand.border};
      border-radius: 16px;
      padding: 28px 32px 24px;
      display: flex;
      flex-direction: column;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-bottom: 22px;
      flex-shrink: 0;
    }
    .logo { height: 26px; width: auto; display: block; }
    h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.03em;
      line-height: 1.12;
      flex-shrink: 0;
    }
    .insight {
      margin: 14px 0 0;
      font-size: 14px;
      line-height: 1.65;
      color: ${brand.muted};
      max-width: 92%;
      flex-shrink: 0;
    }
    .insight strong { color: ${brand.charcoal}; font-weight: 600; }
    .underline {
      color: ${brand.charcoal};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-color: ${brand.border};
    }
    .chart { margin-top: 20px; flex-shrink: 0; }
    .chart svg { width: 100%; height: auto; display: block; }
    .legend {
      margin-top: 10px;
      text-align: center;
      font-size: 12px;
      color: ${brand.muted};
      letter-spacing: 0.01em;
    }
    .legend-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${brand.teal};
      margin-right: 7px;
      vertical-align: middle;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 20px;
      flex-shrink: 0;
    }
    .kpi {
      background: ${brand.wash};
      border-radius: 12px;
      padding: 16px 10px;
      text-align: center;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      word-break: break-word;
      line-height: 1.2;
    }
    .kpi-label {
      margin-top: 8px;
      font-size: 11px;
      color: ${brand.muted};
      line-height: 1.3;
    }
    .summary {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid ${brand.border};
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .plan-block h2, .summary h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.015em;
      line-height: 1.4;
    }
    .plan-block > p, .summary > p {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.55;
      color: ${brand.muted};
    }
    .section-label {
      margin-top: 0;
      margin-bottom: 8px;
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${brand.muted};
      font-weight: 600;
    }
    .summary .section-label { margin-top: 16px; }
    .break-row { padding: 10px 0; border-bottom: 1px solid ${brand.border}; }
    .break-row:last-child { border-bottom: none; }
    .break-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .break-name { font-size: 14px; font-weight: 600; }
    .break-metrics {
      display: flex;
      align-items: baseline;
      gap: 14px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .break-tokens { font-size: 13px; font-weight: 600; color: ${brand.charcoal}; }
    .break-cost { font-size: 13px; font-weight: 600; color: ${brand.muted}; }
    .break-meta { margin-top: 4px; font-size: 12px; color: ${brand.muted}; line-height: 1.4; }
    .bar-track {
      margin-top: 8px;
      height: 6px;
      background: ${brand.track};
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 6px;
      background: ${brand.teal};
      border-radius: 999px;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-top: auto;
      padding-top: 14px;
      flex-shrink: 0;
    }
    .cta {
      display: inline-block;
      color: ${brand.teal};
      text-decoration: underline;
      text-underline-offset: 3px;
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
      margin-left: auto;
    }
    .footer {
      font-size: 11px;
      line-height: 1.55;
      color: ${brand.muted};
      max-width: 58%;
    }
    .footer a { color: ${brand.teal}; }
    .muted { color: ${brand.muted}; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="UseJunction" />` : `<div style="font-weight:700;font-size:16px;">UseJunction</div>`}
    </div>

    <h1>${escapeHtml(greeting)}.</h1>
    <p class="insight">${insightHtml}</p>

    <div class="chart">
      ${chartSvg}
      <div class="legend"><span class="legend-dot"></span>${escapeHtml(chartLegend)}</div>
    </div>

    <div class="kpis">
      ${tiles
        .map(
          (t) => `<div class="kpi">
        <div class="kpi-value">${escapeHtml(t.value)}</div>
        <div class="kpi-label">${escapeHtml(t.label)}</div>
      </div>`,
        )
        .join("")}
    </div>

    <div class="summary">
      ${planSection}
      <div class="section-label">Usage by tool</div>
      ${breakdown}
    </div>

    <div class="actions">
      <div class="footer">
        ${escapeHtml(isTeamWeek ? `Sent Sundays at 19:00 in ${report.timeZone}.` : `Sent at 19:00 in ${report.timeZone}.`)}
        <a href="${escapeHtml(settingsUrl)}">Manage email reports</a>
      </div>
      <a class="cta" href="${escapeHtml(url)}">${escapeHtml(cta)}</a>
    </div>
  </div>
</body>
</html>`;

  return { html, filename, subject, url };
}
