import type { SVGProps, ComponentType, CSSProperties } from "react";
import { Wrench } from "lucide-react";
import {
  ClaudeCode,
  Cline,
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
import { canonicalToolKey, toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";

type BrandIcon = ComponentType<{ size?: number | string; style?: CSSProperties; className?: string }> & {
  Color?: ComponentType<{ size?: number | string; style?: CSSProperties; className?: string }>;
  colorPrimary?: string;
};

const icons: Record<string, BrandIcon> = {
  "chatgpt-codex": OpenAI as BrandIcon,
  claude: ClaudeCode as BrandIcon,
  cursor: Cursor as BrandIcon,
  antigravity: Gemini as BrandIcon,
  "github-copilot": GithubCopilot as BrandIcon,
  copilot: GithubCopilot as BrandIcon,
  cline: Cline as BrandIcon,
  deepseek: DeepSeek as BrandIcon,
  gemini: Gemini as BrandIcon,
  groq: Groq as BrandIcon,
  "lm-studio": LmStudio as BrandIcon,
  lmstudio: LmStudio as BrandIcon,
  mistral: Mistral as BrandIcon,
  ollama: Ollama as BrandIcon,
  opencode: OpenCode as BrandIcon,
  "open-code": OpenCode as BrandIcon,
  "roo-code": RooCode as BrandIcon,
  roocode: RooCode as BrandIcon,
};

/** Brand fills when an icon has no `.Color` compound (ChatGPT, Cursor, Copilot, …). */
export const TOOL_BRAND_COLORS: Record<string, string> = {
  "chatgpt-codex": "#10A37F",
  claude: "#D97757",
  cursor: "#171717",
  antigravity: "#4285F4",
  "github-copilot": "#8250DF",
  copilot: "#8250DF",
  cline: "#0EA5E9",
  deepseek: "#4D6BFE",
  gemini: "#4285F4",
  groq: "#F55036",
  "lm-studio": "#4338CA",
  lmstudio: "#4338CA",
  mistral: "#FF7000",
  ollama: "#16A34A",
  opencode: "#2563EB",
  "open-code": "#2563EB",
  "roo-code": "#F97316",
  roocode: "#F97316",
};

const FALLBACK_TOOL_COLORS = ["#08758a", "#c45c26", "#5b5bd6", "#0d9488", "#b45309", "#7c3aed"];

export function toolBrandColor(tool: string, index = 0): string {
  const key = canonicalToolKey(tool);
  return TOOL_BRAND_COLORS[key] ?? FALLBACK_TOOL_COLORS[index % FALLBACK_TOOL_COLORS.length]!;
}

export function hasToolBrandIcon(tool: string) {
  return canonicalToolKey(tool) in icons;
}

export function ToolBrandIcon({
  tool,
  size = 22,
  className,
  mono = false,
  ...props
}: {
  tool: string;
  size?: number;
  /** Force monochrome (inherits text color). Default is brand color. */
  mono?: boolean;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "size">) {
  const key = canonicalToolKey(tool);
  const Icon = icons[key] ?? (Wrench as BrandIcon);

  if (!mono && Icon.Color) {
    return <Icon.Color aria-hidden="true" className={cn("shrink-0", className)} size={size} />;
  }

  if (!mono) {
    const color = TOOL_BRAND_COLORS[key] ?? Icon.colorPrimary;
    if (color) {
      return (
        <Icon
          aria-hidden="true"
          className={cn("shrink-0", className)}
          size={size}
          style={{ color }}
          {...props}
        />
      );
    }
  }

  return (
    <Icon
      aria-hidden="true"
      className={cn("shrink-0 text-foreground", className)}
      size={size}
      {...props}
    />
  );
}

export function ToolLogoTile({
  tool,
  size = "md",
  className,
  light = false,
}: {
  tool: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** White tile for light surfaces (work tables, summaries). */
  light?: boolean;
}) {
  const dimensions = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 26 : 21;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        light ? "border border-border/70 bg-white" : "bg-muted/50",
        dimensions,
        className,
      )}
      title={toolDisplayName(tool)}
    >
      <ToolBrandIcon tool={tool} size={iconSize} />
    </span>
  );
}

/** Logo + short name for tool columns and summary chips. */
export function ToolBrandLabel({
  tool,
  size = "sm",
  subtitle,
  className,
  light = true,
}: {
  tool: string;
  size?: "sm" | "md";
  subtitle?: string | null;
  className?: string;
  light?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <ToolLogoTile tool={tool} size={size} light={light} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{toolDisplayName(tool)}</p>
        {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
