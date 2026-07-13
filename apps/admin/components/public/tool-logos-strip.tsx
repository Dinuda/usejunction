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
    <section className="border-y border-border bg-background py-12">
      <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
        <p className="mb-10 text-center font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Supported tools &amp; runtimes
        </p>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {SUPPORTED_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.name] ?? Code2;
            return (
              <div key={tool.name} className="flex items-center gap-3">
                <div
                  className="flex size-11 items-center justify-center border border-border bg-card transition-colors hover:border-primary"
                  aria-hidden
                >
                  <Icon size={22} />
                </div>
                <span className="text-sm text-muted-foreground">{tool.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
