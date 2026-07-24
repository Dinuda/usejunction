import fs from "node:fs";
import path from "node:path";
import { canonicalToolKey } from "@/lib/tools/catalog";

/**
 * SVG marks extracted from `@lobehub/icons` — the same pack as
 * `ToolBrandIcon` / dashboard (`apps/admin/lib/tool-icons.tsx`).
 */
const TOOL_LOGO_FILES: Record<string, string> = {
  cursor: "cursor.svg",
  "chatgpt-codex": "chatgpt.svg",
  chatgpt: "chatgpt.svg",
  "github-copilot": "copilot.svg",
  copilot: "copilot.svg",
  antigravity: "antigravity.svg",
  gemini: "antigravity.svg",
  claude: "claude.svg",
  cline: "cline.svg",
  deepseek: "deepseek.svg",
  groq: "groq.svg",
  "lm-studio": "lm-studio.svg",
  lmstudio: "lm-studio.svg",
  mistral: "mistral.svg",
  ollama: "ollama.svg",
  opencode: "opencode.svg",
  "open-code": "opencode.svg",
  "roo-code": "roo-code.svg",
  roocode: "roo-code.svg",
};

const cache = new Map<string, string>();

function logoDir() {
  return path.join(process.cwd(), "public", "tool-logos");
}

function logoFileFor(toolName: string): string | null {
  const key = canonicalToolKey(toolName) || toolName.toLowerCase();
  return TOOL_LOGO_FILES[key] ?? TOOL_LOGO_FILES[toolName.toLowerCase()] ?? null;
}

/** Absolute URL for HTML email img tags (hosted lobehub SVGs). */
export function toolLogoUrl(toolName: string, appOrigin: string): string | null {
  const file = logoFileFor(toolName);
  if (!file) return null;
  return `${appOrigin.replace(/\/$/, "")}/tool-logos/${file}`;
}

/** data:image/svg+xml;base64 for PDF / offline HTML. */
export function toolLogoDataUri(toolName: string): string | null {
  const file = logoFileFor(toolName);
  if (!file) return null;
  const cached = cache.get(file);
  if (cached) return cached;
  try {
    const buf = fs.readFileSync(path.join(logoDir(), file));
    const uri = `data:image/svg+xml;base64,${buf.toString("base64")}`;
    cache.set(file, uri);
    return uri;
  } catch {
    return null;
  }
}

export function toolLogoImgHtml(input: {
  toolName: string;
  /** Prefer absolute http(s) for email; data URI for PDF. */
  src: string | null;
  size?: number;
}): string {
  const size = input.size ?? 16;
  if (!input.src) {
    return `<span style="display:inline-block;width:${size}px;height:${size}px;background:#ecece8;vertical-align:middle;"></span>`;
  }
  return `<img src="${input.src.replaceAll('"', "&quot;")}" width="${size}" height="${size}" alt="" style="display:inline-block;width:${size}px;height:${size}px;border:0;vertical-align:middle;" />`;
}
