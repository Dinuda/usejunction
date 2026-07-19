import type { ComponentType } from "react";
import {
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  GithubCopilot,
  LmStudio,
  Ollama,
  OpenCode,
  RooCode,
} from "@/lib/tool-icons";
import { Code2 } from "lucide-react";
import { SUPPORTED_TOOLS } from "@/lib/public/config";

type IconProps = { size?: number | string; className?: string };

const TOOL_ICONS: Record<string, ComponentType<IconProps>> = {
  Codex,
  "Claude Code": ClaudeCode,
  Cursor,
  Continue: Code2,
  Cline,
  "Roo Code": RooCode,
  OpenCode,
  "GitHub Copilot": GithubCopilot,
  Ollama,
  "LM Studio": LmStudio,
};

export function ToolLogosStrip() {
  return (
    <section className="border-b border-border py-12 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
        <p className="mx-auto max-w-2xl text-center font-mono text-xs uppercase tracking-[0.16em] text-primary">
          Works with the tools your team already uses
        </p>
        <div className="mx-auto mt-10 flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-5 sm:gap-x-8">
          {SUPPORTED_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.name] ?? Code2;
            return (
              <div key={tool.name} className="flex items-center gap-2.5">
                <div
                  className="flex size-10 items-center justify-center border border-border bg-card transition-colors hover:border-primary"
                  aria-hidden
                >
                  <Icon size={20} />
                </div>
                <span className="text-sm font-medium text-muted-foreground">{tool.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
