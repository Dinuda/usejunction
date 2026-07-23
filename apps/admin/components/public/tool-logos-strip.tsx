import type { ComponentType, CSSProperties } from "react";
import {
  ClaudeCode,
  Cline,
  Codex,
  Cursor,
  Gemini,
  GithubCopilot,
  LmStudio,
  Ollama,
  OpenCode,
  RooCode,
} from "@/lib/tool-icons";
import { Code2 } from "lucide-react";
import { SUPPORTED_TOOLS } from "@/lib/public/config";
import { Marquee } from "@/components/shadcn-space/animations/marquee";

type IconComponent = ComponentType<{ size?: number | string; style?: CSSProperties; className?: string }> & {
  Color?: ComponentType<{ size?: number | string; style?: CSSProperties; className?: string }>;
  colorPrimary?: string;
};

const TOOL_ICONS: Record<string, IconComponent> = {
  Codex: Codex as IconComponent,
  "Claude Code": ClaudeCode as IconComponent,
  Cursor: Cursor as IconComponent,
  Antigravity: Gemini as IconComponent,
  Continue: Code2 as IconComponent,
  Cline: Cline as IconComponent,
  "Roo Code": RooCode as IconComponent,
  OpenCode: OpenCode as IconComponent,
  "GitHub Copilot": GithubCopilot as IconComponent,
  Ollama: Ollama as IconComponent,
  "LM Studio": LmStudio as IconComponent,
};

const BRAND_COLORS: Record<string, string> = {
  Codex: "#10A37F",
  "Claude Code": "#D97757",
  Cursor: "#171717",
  Antigravity: "#4285F4",
  Continue: "#1D4ED8",
  Cline: "#0EA5E9",
  "Roo Code": "#F97316",
  OpenCode: "#2563EB",
  "GitHub Copilot": "#8250DF",
  Ollama: "#16A34A",
  "LM Studio": "#4338CA",
};

function ColoredToolIcon({ name, Icon }: { name: string; Icon: IconComponent }) {
  const size = 28;

  if (Icon.Color) {
    return <Icon.Color size={size} className="shrink-0" />;
  }

  return (
    <Icon
      size={size}
      className="shrink-0"
      style={{ color: BRAND_COLORS[name] ?? Icon.colorPrimary ?? "currentColor" }}
    />
  );
}

export function ToolLogosStrip() {
  return (
    <section className="border-border bg-white py-10 sm:py-12">
      <Marquee className="[--duration:40s] [--gap:2.5rem] p-0 sm:[--gap:3.5rem]" pauseOnHover>
        {SUPPORTED_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.name] ?? (Code2 as IconComponent);
          return (
            <div key={tool.name} className="flex items-center gap-3">
              <ColoredToolIcon name={tool.name} Icon={Icon} />
              <span className="whitespace-nowrap text-sm font-medium text-foreground">{tool.name}</span>
            </div>
          );
        })}
      </Marquee>
    </section>
  );
}
