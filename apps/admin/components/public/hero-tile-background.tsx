"use client";

import { useEffect, useRef } from "react";

const BG = "#ffffff";
const TILE = "#ffffff";
const BORDER = "#ebebeb";
const GRID_COLS = 52;
const GRID_ROWS = 34;
const GAP_RATIO = 0.055;
const BORDER_OPACITY = 0.5;
/** Only draw tiles on the left portion of the hero. */
const ACTIVE_COLS = 20;

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

function drawStaticTileGrid(ctx: CanvasRenderingContext2D, layout: GridLayout) {
  const tileRGB = parseHex(TILE);
  const borderRGB = parseHex(BORDER);
  const { cellSize, gap, offsetX, offsetY, width, height } = layout;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < ACTIVE_COLS; col++) {
      const x = offsetX + col * cellSize + gap / 2;
      const y = offsetY + row * cellSize + gap / 2;
      const size = cellSize - gap;

      // Fade grid toward the right (into white)
      const colFade = 1 - col / (ACTIVE_COLS - 1);
      const opacity = BORDER_OPACITY * (0.55 + 0.45 * colFade);

      ctx.fillStyle = `rgb(${tileRGB.r}, ${tileRGB.g}, ${tileRGB.b})`;
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = `rgba(${borderRGB.r}, ${borderRGB.g}, ${borderRGB.b}, ${opacity})`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, size, size);
    }
  }
}

export function HeroTileBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
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

      drawStaticTileGrid(ctx, nextLayout);
    };

    paint();
    window.addEventListener("resize", paint);
    return () => window.removeEventListener("resize", paint);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ background: BG }} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          maskImage:
            "linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 22%, transparent 48%)",
          WebkitMaskImage:
            "linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 22%, transparent 48%)",
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {/* Soft wash behind copy so text stays clear of the grid */}
      <div
        className="absolute left-[4%] top-1/2 h-[58%] w-[42%] -translate-y-1/2 lg:left-[6%] lg:w-[36%]"
        style={{
          background:
            "radial-gradient(ellipse at 35% 50%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.9) 40%, rgba(255,255,255,0.55) 65%, transparent 82%)",
        }}
      />
    </div>
  );
}
