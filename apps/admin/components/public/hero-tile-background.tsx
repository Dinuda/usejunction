"use client";

import {
  Anthropic,
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  DeepSeek,
  Gemini,
  GithubCopilot,
  Groq,
  LmStudio,
  Mistral,
  Ollama,
  OpenAI,
  OpenCode,
  RooCode,
} from "@/lib/tool-icons";
import type { ComponentType, CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const BG = "#fafafa";
const TILE = "#fafafa";
const BORDER = "#e5e5e5";
const LOGO_COLOR = "#737373";
const GRID_COLS = 52;
const GRID_ROWS = 34;
const GAP_RATIO = 0.055;
const BORDER_OPACITY = 0.18;

const BRAND_COLORS = {
  Cursor: "#171717",
  ClaudeCode: "#D97757",
  GithubCopilot: "#8250DF",
  Codex: "#10A37F",
  Cline: "#323B43",
  Ollama: "#404040",
  OpenAI: "#10A37F",
  Anthropic: "#D97757",
  Gemini: "#4285F4",
  Mistral: "#FA520F",
  DeepSeek: "#4D6BFE",
  Groq: "#F55036",
  LmStudio: "#4338CA",
  OpenCode: "#2563EB",
  RooCode: "#EA580C",
} as const;

function mutedBorder(hex: string, alpha = 0.36) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type LogoTile = {
  col: number;
  row: number;
  Icon: ComponentType<{ size?: number | string; style?: CSSProperties }>;
  borderColor: string;
  subtle?: boolean;
};

const LOGO_TILES: LogoTile[] = [
  { col: 31, row: 4, Icon: Cursor, borderColor: mutedBorder(BRAND_COLORS.Cursor) },
  { col: 37, row: 8, Icon: ClaudeCode, borderColor: mutedBorder(BRAND_COLORS.ClaudeCode) },
  { col: 44, row: 5, Icon: OpenAI, borderColor: mutedBorder(BRAND_COLORS.OpenAI) },
  { col: 40, row: 14, Icon: Gemini, borderColor: mutedBorder(BRAND_COLORS.Gemini) },
  { col: 47, row: 11, Icon: GithubCopilot, borderColor: mutedBorder(BRAND_COLORS.GithubCopilot) },
  { col: 33, row: 19, Icon: Ollama, borderColor: mutedBorder(BRAND_COLORS.Ollama) },
  { col: 42, row: 22, Icon: Cline, borderColor: mutedBorder(BRAND_COLORS.Cline) },
  { col: 36, row: 27, Icon: Mistral, borderColor: mutedBorder(BRAND_COLORS.Mistral) },
  { col: 48, row: 28, Icon: DeepSeek, borderColor: mutedBorder(BRAND_COLORS.DeepSeek) },
  { col: 28, row: 30, Icon: LmStudio, borderColor: mutedBorder(BRAND_COLORS.LmStudio) },
  { col: 45, row: 18, Icon: OpenCode, borderColor: mutedBorder(BRAND_COLORS.OpenCode) },
];

type GridLayout = {
  cellSize: number;
  gap: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

function parseHex(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function computeGridLayout(width: number, height: number): GridLayout {
  const cellSize = Math.max(width / GRID_COLS, height / GRID_ROWS);
  const gap = cellSize * GAP_RATIO;
  const gridWidth = cellSize * GRID_COLS;
  const gridHeight = cellSize * GRID_ROWS;
  return {
    cellSize,
    gap,
    offsetX: (width - gridWidth) / 2,
    offsetY: (height - gridHeight) / 2,
    width,
    height,
  };
}

function cellKey(col: number, row: number) {
  return `${col},${row}`;
}

function tileElevation(col: number, row: number, time: number) {
  return (Math.sin(col * 0.22 + time * 0.0009) + Math.cos(row * 0.18 + time * 0.0007)) * 1.0;
}

function drawTileGrid(
  ctx: CanvasRenderingContext2D,
  layout: GridLayout,
  logoCells: Set<string>,
  time = 0,
  animate: boolean
) {
  const tileRGB = parseHex(TILE);
  const borderRGB = parseHex(BORDER);
  const { cellSize, gap, offsetX: offsetXGrid, offsetY: offsetYGrid, width, height } = layout;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (logoCells.has(cellKey(col, row))) continue;

      const elevation = animate ? tileElevation(col, row, time) : 0;

      const x = offsetXGrid + col * cellSize;
      const y = offsetYGrid + row * cellSize;
      const offsetX = -elevation * 0.8;
      const offsetY = -elevation * 1.1;

      if (elevation > 0.4) {
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.04, elevation * 0.012)})`;
        ctx.fillRect(
          x + gap / 2 + elevation * 0.8,
          y + gap / 2 + elevation * 1.0,
          cellSize - gap,
          cellSize - gap
        );
      }

      const brightness = 1 + elevation * 0.01;
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(tileRGB.r * brightness))}, ${Math.min(255, Math.round(tileRGB.g * brightness))}, ${Math.min(255, Math.round(tileRGB.b * brightness))})`;
      ctx.fillRect(
        x + gap / 2 + offsetX,
        y + gap / 2 + offsetY,
        cellSize - gap,
        cellSize - gap
      );

      ctx.strokeStyle = `rgba(${borderRGB.r}, ${borderRGB.g}, ${borderRGB.b}, ${BORDER_OPACITY})`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(
        x + gap / 2 + offsetX,
        y + gap / 2 + offsetY,
        cellSize - gap,
        cellSize - gap
      );
    }
  }
}

function LogoTileOverlay({
  tile,
  layout,
  tileRef,
}: {
  tile: LogoTile;
  layout: GridLayout;
  tileRef: (el: HTMLDivElement | null) => void;
}) {
  const { cellSize, gap, offsetX, offsetY } = layout;
  const x = offsetX + tile.col * cellSize;
  const y = offsetY + tile.row * cellSize;
  const inner = cellSize - gap;
  const iconSize = Math.max(12, Math.round(inner * (tile.subtle ? 0.5 : 0.56)));
  const Icon = tile.Icon;

  return (
    <div
      ref={tileRef}
      className="absolute flex items-center justify-center"
      style={{
        left: x + gap / 2,
        top: y + gap / 2,
        width: inner,
        height: inner,
        background: TILE,
        border: `1px solid ${tile.borderColor}`,
        boxSizing: "border-box",
        opacity: tile.subtle ? 0.78 : 0.94,
        zIndex: 1,
      }}
    >
      <Icon
        size={iconSize}
        style={{ color: tile.subtle ? "#8a8a8a" : LOGO_COLOR, flexShrink: 0 }}
      />
    </div>
  );
}

function applyLogoElevation(el: HTMLDivElement, col: number, row: number, time: number) {
  const elevation = tileElevation(col, row, time);
  const offsetX = -elevation * 0.8;
  const offsetY = -elevation * 1.1;
  el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  el.style.boxShadow =
    elevation > 0.4
      ? `0 ${Math.min(6, elevation * 1.8)}px ${Math.min(10, elevation * 2.5)}px rgba(0, 0, 0, ${Math.min(0.08, elevation * 0.02)})`
      : "none";
}

export function HeroTileBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const frameRef = useRef<number>(0);
  const logoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [layout, setLayout] = useState<GridLayout | null>(null);

  const logoCells = useMemo(
    () => new Set(LOGO_TILES.map((tile) => cellKey(tile.col, tile.row))),
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = window.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const nextLayout = computeGridLayout(width, height);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      setLayout(nextLayout);

      if (reduceMotion) {
        drawTileGrid(ctx, nextLayout, logoCells, 0, false);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduceMotion) {
      return () => window.removeEventListener("resize", resize);
    }

    const render = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const currentLayout = computeGridLayout(width, height);
      drawTileGrid(ctx, currentLayout, logoCells, time, true);

      for (const tile of LOGO_TILES) {
        const el = logoRefs.current.get(cellKey(tile.col, tile.row));
        if (el) applyLogoElevation(el, tile.col, tile.row, time);
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, [logoCells, reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ background: BG }} aria-hidden>
      <canvas ref={canvasRef} className="h-full w-full" />
      {layout &&
        LOGO_TILES.map((tile) => {
          const key = cellKey(tile.col, tile.row);
          return (
            <LogoTileOverlay
              key={key}
              tile={tile}
              layout={layout}
              tileRef={(el) => {
                if (el) logoRefs.current.set(key, el);
                else logoRefs.current.delete(key);
              }}
            />
          );
        })}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: "52%",
          background:
            "linear-gradient(to right, #fafafa 0%, #fafafa 42%, rgba(250, 250, 250, 0.92) 58%, rgba(250, 250, 250, 0.55) 72%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 78% 22%, color-mix(in srgb, #08758a 12%, transparent), transparent 68%), radial-gradient(ellipse 45% 40% at 12% 88%, color-mix(in srgb, #e2e3dd 55%, transparent), transparent 62%)",
        }}
      />
    </div>
  );
}
