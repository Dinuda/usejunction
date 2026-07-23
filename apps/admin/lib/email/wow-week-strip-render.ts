import { formatCompactNumber, formatUsd } from "@/lib/format";
import {
  metricOf,
  WOW_OUTLIER_DELTA_PCT,
  type RhythmMetric,
  type WowWeekStripV1,
  type WowWeekdayCell,
} from "@/lib/reports/wow-week-strip";

const brand = {
  teal: "#08758a",
  tealMuted: "#a8d0d8",
  charcoal: "#111210",
  muted: "#6b6a64",
  border: "#e8e8e3",
  wash: "#f6f6f3",
  white: "#ffffff",
} as const;

const CELL_HEIGHT = 56;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cellValue(cell: WowWeekdayCell, metric: RhythmMetric) {
  return metricOf(cell, metric);
}

function formatMetric(value: number, metric: RhythmMetric) {
  if (metric === "cost") return formatUsd(value);
  return formatCompactNumber(value);
}

/** Teal fill — darker = higher share of the week's peak day. */
function intensityFill(value: number, max: number): string {
  if (max <= 0 || value <= 0) return brand.wash;
  const t = value / max;
  if (t < 0.2) return "#dceef1";
  if (t < 0.4) return "#a8d0d8";
  if (t < 0.65) return "#4fa0b0";
  if (t < 0.85) return "#2a8a9c";
  return brand.teal;
}

/**
 * Table-based week strip — Gmail/Outlook safe (no absolute positioning / SVG).
 * Bar height tracks that day's share of the week's peak (daily volume, not flat tiles).
 */
export function buildEmailWowWeekStripHtml(strip: WowWeekStripV1, metric?: RhythmMetric): string {
  const active = metric ?? strip.metricDefault;
  const max = Math.max(...strip.cells.map((c) => cellValue(c, active)), 0);
  const colWidth = Math.floor(100 / 7);

  const cells = strip.cells
    .map((cell) => {
      const value = cellValue(cell, active);
      const fill = intensityFill(value, max);
      const isFuture = cell.isPartial && !cell.isToday;
      const barH =
        max > 0 && value > 0 ? Math.max(8, Math.round((value / max) * CELL_HEIGHT)) : 0;
      const spacerH = Math.max(0, CELL_HEIGHT - barH);
      const border = cell.isOutlier
        ? `2px solid ${brand.teal}`
        : cell.isToday
          ? `1px solid ${brand.charcoal}`
          : `1px solid ${brand.border}`;
      const opacity = isFuture ? "0.45" : "1";
      const delta =
        cell.isOutlier && cell.deltaPct != null
          ? `<div style="padding-top:4px;font-size:10px;font-weight:600;color:${brand.charcoal};line-height:1.2;">${escapeHtml(
              `${cell.deltaPct >= 0 ? "+" : ""}${cell.deltaPct.toFixed(0)}%`,
            )}</div>`
          : `<div style="padding-top:4px;font-size:10px;line-height:1.2;color:transparent;">0%</div>`;

      return `<td width="${colWidth}%" valign="top" align="center" style="padding:0 3px;opacity:${opacity};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:${CELL_HEIGHT}px;">
    <tr><td height="${spacerH}" style="font-size:0;line-height:0;height:${spacerH}px;border:${barH === 0 ? border : "none"};border-radius:6px;background-color:${barH === 0 ? brand.white : "transparent"};">${barH === 0 ? "&nbsp;" : ""}</td></tr>
    ${
      barH > 0
        ? `<tr>
      <td height="${barH}" bgcolor="${fill}" style="height:${barH}px;background-color:${fill};border:${border};border-radius:6px;font-size:0;line-height:0;">
        <div style="height:${barH}px;line-height:${barH}px;font-size:0;">&nbsp;</div>
      </td>
    </tr>`
        : ""
    }
  </table>
  <div style="padding-top:8px;font-size:11px;font-weight:600;color:${cell.isToday ? brand.charcoal : brand.muted};line-height:1.2;">${escapeHtml(cell.label)}</div>
  ${delta}
</td>`;
    })
    .join("");

  const partialNote =
    strip.availability === "partial"
      ? `<div style="margin-top:8px;font-size:11px;color:${brand.muted};">Comparing available prior days.</div>`
      : "";

  return `<div style="font-size:14px;line-height:1.55;color:${brand.muted};">${escapeHtml(strip.insight.headline)}</div>
${partialNote}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:18px;">
  <tr>${cells}</tr>
</table>
<div style="margin-top:14px;font-size:11px;color:${brand.muted};">
  Bar height = daily ${escapeHtml(active)} · Ring = ±${WOW_OUTLIER_DELTA_PCT}% vs last week
</div>`;
}

/**
 * SVG week strip for Chrome PDF rendering.
 */
export function buildPdfWowWeekStripSvg(
  strip: WowWeekStripV1,
  metric?: RhythmMetric,
  options?: { width?: number; height?: number },
): string {
  const active = metric ?? strip.metricDefault;
  const width = options?.width ?? 720;
  const height = options?.height ?? 140;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const labelH = 36;
  const plotH = height - padT - labelH;
  const gap = 10;
  const cellW = (width - padL - padR - gap * 6) / 7;
  const max = Math.max(...strip.cells.map((c) => cellValue(c, active)), 0);
  const font = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

  const rects = strip.cells
    .map((cell, i) => {
      const value = cellValue(cell, active);
      const fill = intensityFill(value, max);
      const x = padL + i * (cellW + gap);
      const isFuture = cell.isPartial && !cell.isToday;
      const opacity = isFuture ? 0.45 : 1;
      const barH = max > 0 && value > 0 ? Math.max(8, (value / max) * plotH) : 0;
      const y = padT + (plotH - barH);
      const stroke = cell.isOutlier ? brand.teal : cell.isToday ? brand.charcoal : brand.border;
      const strokeWidth = cell.isOutlier ? 2.5 : 1;
      const empty =
        barH <= 0
          ? `<rect x="${x.toFixed(1)}" y="${padT}" width="${cellW.toFixed(1)}" height="${plotH}" rx="6" ry="6" fill="${brand.white}" stroke="${brand.border}" stroke-width="1" opacity="${opacity}"/>`
          : "";
      const bar =
        barH > 0
          ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${barH.toFixed(1)}" rx="6" ry="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
          : "";
      const delta =
        cell.isOutlier && cell.deltaPct != null
          ? `<text x="${(x + cellW / 2).toFixed(1)}" y="${(padT + plotH + 28).toFixed(1)}" text-anchor="middle" fill="${brand.charcoal}" font-size="10" font-weight="600" font-family="${font}">${escapeHtml(
              `${cell.deltaPct >= 0 ? "+" : ""}${cell.deltaPct.toFixed(0)}%`,
            )}</text>`
          : "";

      return `${empty}
  ${bar}
  <text x="${(x + cellW / 2).toFixed(1)}" y="${(padT + plotH + 16).toFixed(1)}" text-anchor="middle" fill="${cell.isToday ? brand.charcoal : brand.muted}" font-size="11" font-weight="600" font-family="${font}">${escapeHtml(cell.label)}</text>
  ${delta}`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Week-over-week ${escapeHtml(active)} strip">
  ${rects}
</svg>`;
}

export function wowStripMetricLabel(metric: RhythmMetric): string {
  if (metric === "tokens") return "Tokens this week · vs last week";
  if (metric === "cost") return "Spend this week · vs last week";
  return "Requests this week · vs last week";
}

export function formatWowCellMetric(cell: WowWeekdayCell, metric: RhythmMetric): string {
  return formatMetric(cellValue(cell, metric), metric);
}
