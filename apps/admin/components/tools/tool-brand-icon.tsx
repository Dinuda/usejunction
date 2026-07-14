import type { SVGProps } from "react";
import { Wrench } from "lucide-react";
import { ClaudeCode, Cline, Cursor, DeepSeek, Gemini, GithubCopilot, Groq, LmStudio, Mistral, Ollama, OpenAI, OpenCode, RooCode } from "@/lib/tool-icons";
import { canonicalToolKey } from "@/lib/tools/catalog";
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

export function ToolBrandIcon({ tool, size = 22, className, ...props }: { tool: string; size?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "size">) {
  const Icon = icons[canonicalToolKey(tool) as keyof typeof icons] ?? Wrench;
  return <Icon aria-hidden="true" className={cn("text-foreground", className)} size={size} {...props} />;
}

export function ToolLogoTile({ tool, size = "md", className }: { tool: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const dimensions = size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const iconSize = size === "sm" ? 16 : size === "lg" ? 26 : 21;
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg bg-muted/50", dimensions, className)}><ToolBrandIcon tool={tool} size={iconSize} /></span>;
}
