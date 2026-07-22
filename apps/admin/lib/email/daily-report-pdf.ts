import fs from "node:fs";
import path from "node:path";
import type { DailyReportPayload, DailyReportSeriesPoint } from "@/lib/reports/daily-report";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import { reportEmailDeepLink } from "@/lib/email/daily-report-html";

const brand = {
  teal: "#08758a",
  yellow: "#e5ec67",
  yellowDark: "#838a20",
  charcoal: "#111210",
  muted: "#6b6a64",
  border: "#ececea",
  wash: "#f5f5f2",
  page: "#f3f2ee",
  white: "#ffffff",
  track: "#ecece8",
} as const;

const FONT = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

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

function seriesMetric(report: DailyReportPayload): "cost" | "requests" {
  return report.series.some((p) => p.cost > 0) ? "cost" : "requests";
}

function metricValue(point: DailyReportSeriesPoint, metric: "cost" | "requests") {
  return metric === "cost" ? point.cost : point.requests;
}

/** Smooth SVG area chart — Chrome PDF renders this pixel-perfect. */
export function buildPdfAreaChartSvg(
  series: DailyReportSeriesPoint[],
  metric: "cost" | "requests",
  options?: { height?: number },
): string {
  const width = 720;
  const height = options?.height ?? 200;
  const padL = 44;
  const padR = 16;
  const padT = 20;
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
    const label =
      metric === "cost"
        ? formatUsd(v).replace(/\.00$/, "")
        : formatCompactNumber(v);
    return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="${brand.muted}" font-size="11" font-family="${FONT}">${escapeHtml(label)}</text>
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

  const peak = coords[peakI]!;
  const dots = coords
    .map((c, i) => {
      if (i !== peakI && values[i]! <= 0) return "";
      const halo = i === peakI ? `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="12" fill="${brand.teal}" fill-opacity="0.15"/>` : "";
      return `${halo}<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${i === peakI ? 4.5 : 3}" fill="${brand.teal}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric === "cost" ? "Spend" : "Requests"} chart">
  <defs>
    <linearGradient id="ujPdfArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${brand.teal}" stop-opacity="0.32"/>
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

/**
 * Full Chrome-print HTML for the daily/weekly report PDF.
 * Designed to match the reference layout: logo, greeting, SVG area chart, KPI tiles, breakdown.
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
  const windowLabel = isTeamWeek ? "this week" : "today";
  const contextLabel = isTeamWeek ? "This week · Team" : report.kind === "org" ? "Today · Team" : "Today · You";

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
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${report.weekEnd}T00:00:00Z`) - Date.parse(`${report.weekStart}T00:00:00Z`)) /
              86_400_000,
          ) + 1,
        )
      : 7;
  const avgDaily = isTeamWeek ? formatUsd(report.kpis.cost / daysInWeek) : null;

  const deltaPct = report.kpis.costDeltaPct;
  const deltaText =
    deltaPct === null
      ? null
      : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs the prior ${isTeamWeek ? "week" : "day"}`;

  const insightParts: string[] = [`${spend} across ${requests} requests ${windowLabel}.`];
  if (deltaText) insightParts.push(`<span class="underline">${escapeHtml(deltaText)}</span>`);
  if (report.kpis.planUsedPercent != null) insightParts.push(`plans at ${escapeHtml(planUsed)} used`);
  if (report.kpis.acceptancePercent != null) {
    insightParts.push(`${escapeHtml(acceptance)} acceptance (productive effectivity)`);
  }

  const summaryHeading = isTeamWeek
    ? `${spend} spent this week${avgDaily ? `, averaging ${avgDaily} per day` : ""}.`
    : `${spend} spent today.`;
  const summaryDetail = topTool
    ? `${topTool.displayName} led with ${formatCompactNumber(topTool.requests)} requests and ${formatUsd(topTool.cost)} (${formatPct(topTool.sharePercent, 0)} of spend).`
    : "Open the full report in the app for charts and tool detail.";

  const metric = seriesMetric(report);
  const chartSvg = buildPdfAreaChartSvg(
    report.series.length ? report.series : [{ label: "—", requests: 0, tokens: 0, cost: 0 }],
    metric,
    { height: isTeamWeek ? 200 : 180 },
  );
  const chartLegend = isTeamWeek
    ? metric === "cost"
      ? "Daily spend this week"
      : "Requests this week"
    : metric === "cost"
      ? "Spend by hour"
      : "Requests by hour";

  const tiles = [
    { value: spend, label: isTeamWeek ? "Period spend" : "Today's spend" },
    { value: planUsed, label: "Plans used" },
    { value: acceptance, label: "Acceptance" },
    { value: fourthValue, label: fourthLabel },
  ];

  const breakdown =
    report.topTools.length === 0
      ? `<p class="muted">No tool breakdown for this period.</p>`
      : report.topTools
          .slice(0, isTeamWeek ? 6 : 4)
          .map((tool) => {
            const width = Math.max(3, Math.min(100, Math.round(tool.sharePercent)));
            return `<div class="break-row">
  <div class="break-top">
    <span class="break-name">${escapeHtml(tool.displayName)}</span>
    <span class="break-cost">${escapeHtml(formatUsd(tool.cost))}</span>
  </div>
  <div class="break-meta">${escapeHtml(formatCompactNumber(tool.requests))} requests · ${escapeHtml(formatCompactNumber(tool.tokens))} tokens · ${escapeHtml(formatPct(tool.sharePercent, 0))} of spend</div>
  <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
</div>`;
          })
          .join("");

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
    body { padding: 18px 20px; }
    .card {
      width: 100%;
      height: calc(297mm - 36px);
      margin: 0 auto;
      background: ${brand.white};
      border: 1px solid ${brand.border};
      border-radius: 16px;
      padding: 24px 28px 22px;
      display: flex;
      flex-direction: column;
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .logo { height: 24px; width: auto; display: block; }
    .context {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${brand.muted};
      font-weight: 600;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -0.025em;
      line-height: 1.15;
      flex-shrink: 0;
    }
    .insight {
      margin: 10px 0 0;
      font-size: 13px;
      line-height: 1.55;
      color: ${brand.muted};
      max-width: 100%;
      flex-shrink: 0;
    }
    .underline {
      color: ${brand.charcoal};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-color: ${brand.border};
    }
    .chart { margin-top: 16px; flex-shrink: 0; }
    .chart svg { width: 100%; height: auto; display: block; }
    .legend {
      margin-top: 6px;
      text-align: center;
      font-size: 11px;
      color: ${brand.muted};
    }
    .legend-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${brand.teal};
      margin-right: 6px;
      vertical-align: middle;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 16px;
      flex-shrink: 0;
    }
    .kpi {
      background: ${brand.wash};
      border-radius: 10px;
      padding: 14px 8px;
      text-align: center;
    }
    .kpi-value {
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
    .kpi-label {
      margin-top: 6px;
      font-size: 10px;
      color: ${brand.muted};
    }
    .summary {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid ${brand.border};
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .summary h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.35;
    }
    .summary p {
      margin: 8px 0 0;
      font-size: 13px;
      line-height: 1.5;
      color: ${brand.muted};
    }
    .section-label {
      margin-top: 14px;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: ${brand.muted};
      font-weight: 600;
    }
    .break-row { padding: 10px 0; border-bottom: 1px solid ${brand.border}; }
    .break-row:last-child { border-bottom: none; }
    .break-top { display: flex; justify-content: space-between; gap: 12px; }
    .break-name, .break-cost { font-size: 14px; font-weight: 600; }
    .break-meta { margin-top: 4px; font-size: 12px; color: ${brand.muted}; }
    .bar-track {
      margin-top: 8px;
      height: 5px;
      background: ${brand.track};
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 5px;
      background: ${brand.teal};
      border-radius: 999px;
    }
    .actions {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-top: auto;
      padding-top: 14px;
      flex-shrink: 0;
    }
    .cta {
      display: inline-block;
      background: ${brand.yellow};
      color: ${brand.charcoal};
      text-decoration: none;
      padding: 11px 18px;
      font-weight: 600;
      font-size: 13px;
      border: 1px solid ${brand.yellowDark};
      border-radius: 8px;
      white-space: nowrap;
      margin-left: auto;
    }
    .footer {
      font-size: 11px;
      line-height: 1.5;
      color: ${brand.muted};
      max-width: 55%;
    }
    .footer a { color: ${brand.teal}; }
    .muted { color: ${brand.muted}; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="UseJunction" />` : `<div style="font-weight:700;font-size:16px;">UseJunction</div>`}
      <div class="context">${escapeHtml(contextLabel)}</div>
    </div>

    <h1>${escapeHtml(greeting)}.</h1>
    <p class="insight">${insightParts.join(" · ")}.</p>

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
      <h2>${escapeHtml(summaryHeading)}</h2>
      <p>${escapeHtml(summaryDetail)}</p>
      <div class="section-label">Breakdown</div>
      ${breakdown}
    </div>

    <div class="actions">
      <div class="footer">
        ${escapeHtml(isTeamWeek ? `Sent Sundays at 19:00 in ${report.timeZone}.` : `Sent at 19:00 in ${report.timeZone}.`)}
        <a href="${escapeHtml(settingsUrl)}">Manage email reports</a>
      </div>
      <a class="cta" href="${escapeHtml(url)}">${escapeHtml(isTeamWeek ? "Open this week's report" : "Open today's report")}</a>
    </div>
  </div>
</body>
</html>`;

  return { html, filename, subject, url };
}
