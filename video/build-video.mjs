import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js";

const exec = promisify(execFile);
const root = path.resolve("video");
const framesDir = path.join(root, "frames");
const dashboardDir = path.join(root, "assets", "dashboard");
const renderDir = path.join(root, "renders");
const W = 1920;
const H = 1080;
const V_W = 1080;
const V_H = 1920;
const FPS = 30;
const TOTAL = 600;

const colors = {
  bg: "#111210",
  panel: "#202419",
  panel2: "#292e20",
  oliveBorder: "#404732",
  yellow: "#e5ec67",
  teal: "#08758a",
  orange: "#c0682c",
  white: "#fafaf7",
  muted: "#9aa094",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ease = (x) => x * x * (3 - 2 * x);
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const fade = (frame, start, end) => clamp((frame - start) / Math.max(1, end - start));
const text = (value, x, y, size, fill, extra = "") => `<text x="${x}" y="${y}" fill="${fill}" font-family="DM Sans, Arial, sans-serif" font-size="${size}" ${extra}>${esc(value)}</text>`;
const mono = (value, x, y, size, fill, extra = "") => `<text x="${x}" y="${y}" fill="${fill}" font-family="JetBrains Mono, Menlo, monospace" font-size="${size}" ${extra}>${esc(value)}</text>`;

const dashboardFiles = (await fs.readdir(dashboardDir)).filter((f) => f.endsWith(".png")).sort();
const logoPath = path.resolve("apps/admin/public/usejunction.png");
const logoData = (await fs.readFile(logoPath)).toString("base64");
const dashboardData = await Promise.all(dashboardFiles.map(async (f) => (await fs.readFile(path.join(dashboardDir, f))).toString("base64")));

function svgBase(width, height, body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111210"/><stop offset="0.58" stop-color="#171b14"/><stop offset="1" stop-color="#202419"/></linearGradient>
    <linearGradient id="tealGlow" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#08758a" stop-opacity="0"/><stop offset="0.5" stop-color="#08758a" stop-opacity="0.8"/><stop offset="1" stop-color="#08758a" stop-opacity="0"/></linearGradient>
    <filter id="shadow"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="glow"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${defs}
  </defs>${body}</svg>`;
}

function grid(width, height, opacity = 0.1) {
  let lines = `<g stroke="#9aa094" stroke-opacity="${opacity}" stroke-width="1">`;
  for (let x = 0; x <= width; x += 48) lines += `<path d="M${x} 0V${height}"/>`;
  for (let y = 0; y <= height; y += 48) lines += `<path d="M0 ${y}H${width}"/>`;
  return `${lines}</g>`;
}

function logo(x, y, width, opacity = 1) {
  const height = width * 0.157;
  return `<image href="data:image/png;base64,${logoData}" x="${x}" y="${y}" width="${width}" height="${height}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
}

function toolPanel(label, x, y, w, h, accent, variant) {
  const code = variant === 0 ? ["const route = await junction.observe(", "  tool: \"cursor\",", "  model: \"gpt-4o\",", ");"] : variant === 1 ? ["$ claude-code --model sonnet", "> inspect usage", "  12,847 requests / 24h", "  status: connected"] : variant === 2 ? ["CODEX TASK", "Refactor auth middleware", "model     gpt-4o", "latency   890ms"] : ["$ ollama run llama3.1:70b", "local inference ready", "tokens    840K", "cost      $0.00"];
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#151813" stroke="${colors.oliveBorder}"/>
    <rect x="${x}" y="${y}" width="${w}" height="24" rx="6" fill="${colors.panel2}"/>
    <circle cx="${x + 14}" cy="${y + 12}" r="3" fill="${colors.orange}"/><circle cx="${x + 25}" cy="${y + 12}" r="3" fill="${colors.muted}"/><circle cx="${x + 36}" cy="${y + 12}" r="3" fill="${colors.muted}"/>
    ${mono(label, x + 58, y + 16, 11, accent, 'letter-spacing="1.5"')}
    ${code.map((line, i) => mono(line, x + 18, y + 54 + i * 24, 13, i === 0 ? colors.white : colors.muted)).join("")}
    <rect x="${x + 18}" y="${y + h - 28}" width="${w - 36}" height="1" fill="${accent}" opacity="0.5"/>
  </g>`;
}

function junctionSymbol(cx, cy, size, opacity = 1) {
  const half = size / 2;
  return `<g opacity="${opacity}" filter="url(#glow)"><path d="M ${cx} ${cy - half} L ${cx + half} ${cy} L ${cx} ${cy + half} L ${cx - half} ${cy} Z" fill="${colors.yellow}" fill-opacity="0.18" stroke="${colors.yellow}" stroke-width="3"/><path d="M ${cx - half * 0.55} ${cy} H ${cx + half * 0.55} M ${cx} ${cy - half * 0.55} V ${cy + half * 0.55}" stroke="${colors.yellow}" stroke-width="3"/></g>`;
}

function routeLine(x1, y1, x2, y2, p, color = colors.teal) {
  const q = ease(clamp(p));
  const mx = x1 + (x2 - x1) * q;
  const my = y1 + (y2 - y1) * q;
  return `<path d="M${x1} ${y1} L${mx} ${my}" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="${0.45 + q * 0.55}"/>`;
}

function introFrame(frame, vertical) {
  const outW = vertical ? V_W : W;
  const outH = vertical ? V_H : H;
  const t = frame / FPS;
  let body = `<rect width="${outW}" height="${outH}" fill="url(#bg)"/>${grid(outW, outH, 0.08)}`;
  body += `<rect x="0" y="${outH - 2}" width="${outW}" height="2" fill="url(#tealGlow)"/>`;
  const panels = vertical ? [
    [80, 200, 920, 280], [80, 540, 920, 280], [80, 880, 920, 280], [80, 1220, 920, 280],
  ] : [
    [80, 260, 420, 280], [520, 260, 420, 280], [1000, 260, 420, 280], [1480, 260, 360, 280],
  ];
  const labels = ["CURSOR", "CLAUDE CODE", "CODEX", "LOCAL MODEL"];
  const accents = [colors.yellow, colors.orange, colors.teal, colors.muted];
  const positions = vertical ? [0, 1, 2, 3] : [0, 1, 2, 3];
  panels.forEach((p, i) => {
    const [x, y, w, h] = p;
    const start = i * 0.75 * FPS;
    const opacity = clamp(fade(frame, start - 8, start + 12));
    body += `<g opacity="${opacity}" transform="translate(0 ${Math.sin((frame + i * 15) / 12) * 2})">${toolPanel(labels[i], x, y, w, h, accents[i], i)}</g>`;
  });
  if (t >= 2.55) {
    const p = fade(frame, 2.55 * FPS, 3.4 * FPS);
    const cx = vertical ? 540 : 960;
    const cy = vertical ? 1480 : 680;
    panels.forEach((pnl, i) => {
      const [x, y, w, h] = pnl;
      const sx = x + w / 2;
      const sy = y + h / 2;
      body += routeLine(sx, sy, cx, cy, p, accents[i]);
    });
    body += junctionSymbol(cx, cy, vertical ? 180 : 160, clamp(p * 1.2));
  }
  if (frame >= 0 && frame < 3 * FPS) {
    body += text("Your team uses every AI coding tool.", vertical ? 80 : 120, vertical ? 1660 : 900, vertical ? 54 : 52, colors.white, 'font-weight="700" letter-spacing="-1"');
  }
  if (frame >= 3 * FPS && frame < 4.7 * FPS) {
    const p = fade(frame, 3 * FPS, 4.7 * FPS);
    body += `<rect width="${outW}" height="${outH}" fill="${colors.bg}" opacity="${p * 0.85}"/>`;
    body += junctionSymbol(outW / 2, outH / 2, vertical ? 230 : 220, 0.85);
    body += text("But nobody sees the full picture.", vertical ? 80 : 120, vertical ? 1640 : 900, vertical ? 52 : 52, colors.white, 'font-weight="700" letter-spacing="-1"');
  }
  return svgBase(outW, outH, body);
}

function dashboardFrame(frame, vertical) {
  const outW = vertical ? V_W : W;
  const outH = vertical ? V_H : H;
  const t = frame / FPS;
  const reveal = clamp(fade(frame, 5.8 * FPS, 6.5 * FPS));
  const dashIndex = Math.min(dashboardData.length - 1, Math.max(0, Math.floor((frame - 141) * 1.5)));
  let body = `<rect width="${outW}" height="${outH}" fill="url(#bg)"/>${grid(outW, outH, 0.06)}`;
  body += logo(vertical ? 70 : 80, vertical ? 75 : 60, vertical ? 300 : 260, 0.95);
  body += mono("USEJUNCTION / LIVE CONTROL PLANE", vertical ? 70 : 80, vertical ? 154 : 118, 14, colors.yellow, 'letter-spacing="2"');
  const panelX = vertical ? 50 : 260;
  const panelY = vertical ? 330 : 190;
  const panelW = vertical ? 980 : 1400;
  const panelH = vertical ? 900 : 710;
  body += `<rect x="${panelX + 12}" y="${panelY + 18}" width="${panelW}" height="${panelH}" rx="8" fill="#000" opacity="0.35" filter="url(#shadow)"/>`;
  body += `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="8" fill="#f7f7f3" stroke="${colors.yellow}" stroke-width="2" opacity="${0.2 + reveal * 0.8}"/>`;
  if (dashboardData.length) {
    const data = dashboardData[dashIndex];
    const href = `data:image/png;base64,${data}`;
    if (vertical) {
      body += `<image href="${href}" x="${panelX + 18}" y="${panelY + 18}" width="${panelW - 36}" height="${panelH - 36}" preserveAspectRatio="xMidYMid meet" opacity="${reveal}"/>`;
    } else {
      body += `<image href="${href}" x="${panelX + 18}" y="${panelY + 18}" width="${panelW - 36}" height="${panelH - 36}" preserveAspectRatio="xMidYMid meet" opacity="${reveal}"/>`;
    }
  }
  if (t >= 6 && t < 12) {
    const phase = (frame - 180) / 180;
    const labels = ["REQUESTS", "EST. COST", "AVG LATENCY", "ERROR RATE"];
    const values = ["12,847", "$284.50", "1.2s", "0.8%"];
    labels.forEach((label, i) => {
      const bx = vertical ? 70 : 300 + i * 340;
      const by = vertical ? 1270 + (i % 2) * 140 : 940;
      const p = ease(clamp((phase * 4 - i) / 1.4));
      body += `<g opacity="${p}"><rect x="${bx}" y="${by}" width="${vertical ? 440 : 300}" height="${vertical ? 104 : 74}" rx="4" fill="${colors.panel}" stroke="${i === 1 ? colors.yellow : colors.oliveBorder}"/><rect x="${bx}" y="${by}" width="3" height="${vertical ? 104 : 74}" fill="${i === 1 ? colors.yellow : colors.teal}"/>${mono(label, bx + 18, by + 24, 12, colors.muted, 'letter-spacing="1.5"')}${text(values[i], bx + 18, by + (vertical ? 72 : 55), vertical ? 32 : 24, colors.white, 'font-weight="700"')}</g>`;
    });
    body += mono(phase < 0.5 ? "BY TOOL" : "BY MODEL", vertical ? 70 : 300, vertical ? 1650 : 1060, 13, colors.yellow, 'letter-spacing="2"');
  }
  if (t >= 12 && t < 16) {
    const p = ease(clamp((frame - 360) / 30));
    const x = vertical ? 80 : 1180;
    const y = vertical ? 1480 : 430;
    body += `<rect x="${x}" y="${y}" width="${vertical ? 920 : 490}" height="${vertical ? 240 : 230}" rx="6" fill="${colors.panel}" stroke="${colors.yellow}" stroke-width="2" opacity="${p}"/>`;
    body += mono("DEVELOPER / ALEX@ACME.DEV", x + 24, y + 42, 13, colors.yellow, 'letter-spacing="1"');
    body += text("$36.10", x + 24, y + 96, 38, colors.white, 'font-weight="700"');
    body += mono("840K TOKENS   ·   1.1S   ·   2 MODELS", x + 24, y + 136, 13, colors.muted);
    body += `<rect x="${x + 24}" y="${y + 170}" width="${vertical ? 870 : 440}" height="3" rx="2" fill="${colors.oliveBorder}"/><rect x="${x + 24}" y="${y + 170}" width="${vertical ? 620 : 300}" height="3" rx="2" fill="${colors.yellow}"/>`;
  }
  if (t >= 12 && t < 16) {
    body += text("One control plane. Every tool.", vertical ? 70 : 120, vertical ? 1770 : 980, vertical ? 50 : 52, colors.white, 'font-weight="700" letter-spacing="-1"');
  }
  if (t >= 16) {
    const p = ease(clamp((frame - 480) / 30));
    const cardX = vertical ? 70 : 510;
    const cardY = vertical ? 650 : 370;
    const cardW = vertical ? 940 : 900;
    const cardH = vertical ? 210 : 160;
    body = `<rect width="${outW}" height="${outH}" fill="${colors.bg}"/><g opacity="${p}">${grid(outW, outH, 0.055)}<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${colors.white}"/><rect x="${cardX}" y="${cardY + cardH - 5}" width="${cardW}" height="5" rx="2" fill="${colors.yellow}"/>${logo(vertical ? 100 : 560, vertical ? 680 : 400, vertical ? 880 : 800)}${mono("OPEN SOURCE   ·   SELF-HOSTABLE", vertical ? 220 : 650, vertical ? 1020 : 560, vertical ? 22 : 19, colors.yellow, 'letter-spacing="3" text-anchor="middle"')}${text("usejunction.com", vertical ? 540 : 960, vertical ? 1210 : 690, vertical ? 48 : 44, colors.white, 'font-weight="700" text-anchor="middle"')}${text("One control plane. Every tool.", vertical ? 540 : 960, vertical ? 1370 : 780, vertical ? 34 : 30, colors.muted, 'text-anchor="middle"')}</g>`;
  }
  return svgBase(outW, outH, body);
}

function frameSvg(frame, vertical) {
  if (frame < 180) return introFrame(frame, vertical);
  return dashboardFrame(frame, vertical);
}

async function renderPngFrames(vertical) {
  const out = path.join(framesDir, vertical ? "vertical" : "landscape");
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  for (let frame = 0; frame < TOTAL; frame += 1) {
    const svg = frameSvg(frame, vertical);
    await sharp(Buffer.from(svg)).png().toFile(path.join(out, `${String(frame).padStart(4, "0")}.png`));
  }
  return out;
}

async function makeAudio() {
  await fs.mkdir(renderDir, { recursive: true });
  const narration = path.join(renderDir, "narration.aiff");
  const music = path.join(renderDir, "music.wav");
  const narrationText = "Your team uses every AI coding tool. But nobody sees the full picture. UseJunction gives engineering leaders one control plane across tools, models, cost, latency, and failures. Open source. Self-hostable. usejunction.com.";
  await exec("say", ["-v", "Samantha", "-r", "190", "-o", narration, narrationText]);
  await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=74:sample_rate=48000", "-f", "lavfi", "-i", "sine=frequency=148:sample_rate=48000", "-filter_complex", "[0:a]volume=0.04[a0];[1:a]volume=0.025[a1];[a0][a1]amix=inputs=2:duration=longest,lowpass=f=900,afade=t=in:st=0:d=1,afade=t=out:st=18:d=2", "-t", "20", music]);
  return { narration, music };
}

async function encode(name, frames, audio, narration) {
  const out = path.join(renderDir, `${name}.mp4`);
  const audioArgs = narration
    ? ["-i", audio.music, "-i", audio.narration, "-filter_complex", "[1:a]volume=0.55[m];[2:a]loudnorm=I=-16:TP=-1.5:LRA=11[v];[m][v]amix=inputs=2:duration=longest:dropout_transition=1[a]", "-map", "0:v", "-map", "[a]"]
    : ["-i", audio.music, "-map", "0:v", "-map", "1:a"];
  const args = ["-y", "-framerate", String(FPS), "-i", path.join(frames, "%04d.png"), ...audioArgs, "-t", "20", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out];
  await exec("ffmpeg", args, { maxBuffer: 1024 * 1024 * 20 });
  return out;
}

await fs.rm(framesDir, { recursive: true, force: true });
await fs.mkdir(framesDir, { recursive: true });
const [landscapeFrames, verticalFrames] = await Promise.all([renderPngFrames(false), renderPngFrames(true)]);
const audio = await makeAudio();
const outputs = [];
outputs.push(await encode("usejunction-launch-landscape-narration", landscapeFrames, audio, true));
outputs.push(await encode("usejunction-launch-landscape-music", landscapeFrames, audio, false));
outputs.push(await encode("usejunction-launch-vertical-narration", verticalFrames, audio, true));
outputs.push(await encode("usejunction-launch-vertical-music", verticalFrames, audio, false));
await fs.writeFile(path.join(renderDir, "manifest.json"), JSON.stringify({
  sourceScreen: "repo public dashboard demo component recorded locally because no standalone supplied recordings were present",
  durationSeconds: 20,
  fps: FPS,
  outputs,
  specs: { landscape: "1920x1080", vertical: "1080x1920", codec: "H.264 yuv420p", audio: "48 kHz AAC" },
}, null, 2));
console.log(outputs.join("\n"));
