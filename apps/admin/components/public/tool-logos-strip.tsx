"use client";

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
} from "@lobehub/icons";
import { Code2 } from "lucide-react";
import { SUPPORTED_TOOLS } from "@/lib/public/config";

type IconProps = { size?: number | string; className?: string };

const TOOL_ICONS: Record<string, ComponentType<IconProps>> = {
  Codex: Codex,
  "Claude Code": ClaudeCode,
  Cursor: Cursor,
  Continue: Code2,
  Cline: Cline,
  "Roo Code": RooCode,
  OpenCode: OpenCode,
  "GitHub Copilot": GithubCopilot,
  Ollama: Ollama,
  "LM Studio": LmStudio,
};

export function ToolLogosStrip() {
  return (
    <section
      className="border-y py-12"
      style={{ borderColor: "var(--public-border)", background: "var(--public-bg)" }}
    >
      <div className="container">
        <p className="public-eyebrow mb-10 text-center">Supported tools &amp; runtimes</p>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {SUPPORTED_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.name] ?? Code2;
            return (
              <div key={tool.name} className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center border"
                  style={{ borderColor: "var(--public-border)", background: "var(--public-surface)" }}
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
