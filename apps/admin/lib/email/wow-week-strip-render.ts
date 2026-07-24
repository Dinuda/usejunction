import { formatCompactNumber, formatUsd } from "@/lib/format";
import {
  metricOf,
  type RhythmMetric,
  type WowWeekStripV1,
  type WowWeekdayCell,
} from "@/lib/reports/wow-week-strip";

/** Brand tokens from globals.css — cyan primary + orange accent. */
const brand = {
  cyan: "#08758a",
  cyanMuted: "#a8d0d8",
  cyanPale: "#dceef1",
  orange: "#c0682c",
  orangePale: "#fdf3ec",
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

/** Cyan intensity — peak day uses orange. */
function intensityFill(value: number, max: number, isPeak: boolean): string {
  if (max <= 0 || value <= 0) return brand.wash;
  if (isPeak) return brand.orange;
  const t = value / max;
  if (t < 0.25) return brand.cyanPale;
  if (t < 0.5) return brand.cyanMuted;
  if (t < 0.75) return "#4fa0b0";
  return brand.cyan;
}

/**
 * Table-based week strip — Gmail/Outlook safe.
 * Bar height = share of week's peak. Label = absolute token/spend count (no comparisons).
 */
export function buildEmailWowWeekStripHtml(strip: WowWeekStripV1, metric?: RhythmMetric): string {
  const active = metric ?? strip.metricDefault;
  const max = Math.max(...strip.cells.map((c) => cellValue(c, active)), 0);
  const colWidth = Math.floor(100 / 7);
  const peakValue = max;

  const cells = strip.cells
    .map((cell) => {
      const value = cellValue(cell, active);
      const isFuture = cell.isPartial && !cell.isToday;
      const isPeak = value > 0 && value === peakValue;
      const fill = intensityFill(value, max, isPeak);
      const barH =
        max > 0 && value > 0 ? Math.max(8, Math.round((value / max) * CELL_HEIGHT)) : 0;
      const spacerH = Math.max(0, CELL_HEIGHT - barH);
      const border = cell.isToday
        ? `2px solid ${brand.charcoal}`
        : `1px solid ${brand.border}`;
      const opacity = isFuture ? "0.4" : "1";
      const countLabel =
        value > 0
          ? `<div style="padding-top:4px;font-size:10px;font-weight:600;color:${brand.charcoal};line-height:1.2;font-variant-numeric:tabular-nums;">${escapeHtml(
              formatMetric(value, active),
            )}</div>`
          : `<div style="padding-top:4px;font-size:10px;line-height:1.2;color:transparent;">0</div>`;

      return `<td width="${colWidth}%" valign="top" align="center" style="padding:0 3px;opacity:${opacity};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:${CELL_HEIGHT}px;">
    <tr><td height="${spacerH}" style="font-size:0;line-height:0;height:${spacerH}px;border:${barH === 0 ? border : "none"};background-color:${barH === 0 ? brand.white : "transparent"};">${barH === 0 ? "&nbsp;" : ""}</td></tr>
    ${
      barH > 0
        ? `<tr>
      <td height="${barH}" bgcolor="${fill}" style="height:${barH}px;background-color:${fill};border:${border};font-size:0;line-height:0;">
        <div style="height:${barH}px;line-height:${barH}px;font-size:0;">&nbsp;</div>
      </td>
    </tr>`
        : ""
    }
  </table>
  <div style="padding-top:8px;font-size:11px;font-weight:600;color:${cell.isToday ? brand.charcoal : brand.muted};line-height:1.2;">${escapeHtml(cell.label)}</div>
  ${countLabel}
</td>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px;">
  <tr>${cells}</tr>
</table>
<div style="margin-top:12px;font-size:12px;color:${brand.muted};">
  <span style="display:inline-block;width:8px;height:8px;background:${brand.cyan};margin-right:6px;vertical-align:middle;"></span>${escapeHtml(wowStripMetricLabel(active))}
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
  const height = options?.height ?? 148;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const labelH = 44;
  const plotH = height - padT - labelH;
  const gap = 10;
  const cellW = (width - padL - padR - gap * 6) / 7;
  const max = Math.max(...strip.cells.map((c) => cellValue(c, active)), 0);
  const font = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;

  const rects = strip.cells
    .map((cell, i) => {
      const value = cellValue(cell, active);
      const isFuture = cell.isPartial && !cell.isToday;
      const isPeak = value > 0 && value === max;
      const fill = intensityFill(value, max, isPeak);
      const x = padL + i * (cellW + gap);
      const opacity = isFuture ? "0.4" : "1";
      const stroke = cell.isToday ? brand.charcoal : brand.border;
      const strokeWidth = cell.isToday ? "2" : "1";
      const barH = max > 0 && value > 0 ? Math.max(8, (value / max) * plotH) : 0;
      const y = padT + plotH - barH;

      const empty =
        barH <= 0
          ? `<rect x="${x.toFixed(1)}" y="${padT}" width="${cellW.toFixed(1)}" height="${plotH}" fill="${brand.white}" stroke="${brand.border}" stroke-width="1" opacity="${opacity}"/>`
          : "";
      const bar =
        barH > 0
          ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`
          : "";
      const count =
        value > 0
          ? `<text x="${(x + cellW / 2).toFixed(1)}" y="${(padT + plotH + 30).toFixed(1)}" text-anchor="middle" fill="${brand.charcoal}" font-size="10" font-weight="600" font-family="${font}">${escapeHtml(formatMetric(value, active))}</text>`
          : "";

      return `${empty}
  ${bar}
  <text x="${(x + cellW / 2).toFixed(1)}" y="${(padT + plotH + 16).toFixed(1)}" text-anchor="middle" fill="${cell.isToday ? brand.charcoal : brand.muted}" font-size="11" font-weight="600" font-family="${font}">${escapeHtml(cell.label)}</text>
  ${count}`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly ${escapeHtml(active)} strip">
  ${rects}
</svg>`;
}

export function wowStripMetricLabel(metric: RhythmMetric): string {
  if (metric === "tokens") return "Tokens this week";
  if (metric === "cost") return "Spend this week";
  return "Requests this week";
}

export function formatWowCellMetric(cell: WowWeekdayCell, metric: RhythmMetric): string {
  return formatMetric(cellValue(cell, metric), metric);
}
