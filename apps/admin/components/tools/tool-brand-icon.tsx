import type { SVGProps } from "react";
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

const icons = {
  "chatgpt-codex": OpenAI,
  claude: ClaudeCode,
  cursor: Cursor,
  "github-copilot": GithubCopilot,
  copilot: GithubCopilot,
  cline: Cline,
  deepseek: DeepSeek,
  gemini: Gemini,
  groq: Groq,
  "lm-studio": LmStudio,
  lmstudio: LmStudio,
  mistral: Mistral,
  ollama: Ollama,
  opencode: OpenCode,
  "open-code": OpenCode,
  "roo-code": RooCode,
  roocode: RooCode,
};

export function hasToolBrandIcon(tool: string) {
  return canonicalToolKey(tool) in icons;
}

export function ToolBrandIcon({
  tool,
  size = 22,
  className,
  ...props
}: { tool: string; size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "size">) {
  const key = canonicalToolKey(tool);
  const Icon = icons[key as keyof typeof icons] ?? Wrench;
  return (
    <Icon aria-hidden="true" className={cn("text-foreground", className)} size={size} {...props} />
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
