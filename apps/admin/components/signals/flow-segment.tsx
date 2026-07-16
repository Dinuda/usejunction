import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  AppWindow,
  Chrome,
  Database,
  Figma,
  FileText,
  Github,
  Globe,
  Mail,
  type LucideIcon,
  Slack,
  SquareDashed,
} from "lucide-react";
import { hasToolBrandIcon, ToolBrandIcon } from "@/components/tools/tool-brand-icon";
import { toolDisplayName } from "@/lib/tools/catalog";
import { cn } from "@/lib/utils";

export type FlowRole = "before" | "ai" | "after";
export type FlowDensity = "full" | "compact" | "icons";

const APP_ICON_MAP: Record<string, LucideIcon> = {
  chrome: Chrome,
  "google chrome": Chrome,
  slack: Slack,
  github: Github,
  linear: SquareDashed,
  notion: FileText,
  jira: SquareDashed,
  gmail: Mail,
  "google mail": Mail,
  figma: Figma,
  salesforce: Database,
};

const APP_DISPLAY: Record<string, string> = {
  chrome: "Chrome",
  "google chrome": "Chrome",
  slack: "Slack",
  github: "GitHub",
  linear: "Linear",
  notion: "Notion",
  jira: "Jira",
  gmail: "Gmail",
  "google mail": "Gmail",
  figma: "Figma",
  salesforce: "Salesforce",
};

export function flowDisplayLabel(label: string, role: FlowRole): string {
  const trimmed = label.trim();
  if (role === "ai") return toolDisplayName(trimmed);
  const mapped = APP_DISPLAY[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (!trimmed) return trimmed;
  // Title-case words; keep domains as-is aside from first char
  if (/\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(" ")) return trimmed.toLowerCase();
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function appIcon(label: string): LucideIcon | null {
  return APP_ICON_MAP[label.trim().toLowerCase()] ?? null;
}

function isDomain(label: string) {
  return /\.[a-z]{2,}$/i.test(label.trim()) && !label.includes(" ");
}

function SegmentTile({
  icon: Icon,
  tint,
  size = "md",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint?: "ai";
  size?: "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "lg" ? "size-9" : "size-6",
        tint === "ai" ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
      )}
    >
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} />
    </span>
  );
}

function AiTile({ label, size = "md" }: { label: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-primary/10 text-primary",
        size === "lg" ? "size-9" : "size-6",
      )}
    >
      <ToolBrandIcon tool={label} size={size === "lg" ? 20 : 14} />
    </span>
  );
}

export function FlowSegment({
  label,
  role,
  density = "full",
  size = "md",
}: {
  label: string;
  role: FlowRole;
  density?: FlowDensity;
  size?: "md" | "lg";
}) {
  const trimmed = label.trim();
  const display = flowDisplayLabel(trimmed, role);
  const Icon = appIcon(trimmed);
  const showLabel = density !== "icons";
  const labelClass =
    density === "compact"
      ? "text-[11px] font-medium text-muted-foreground"
      : role === "ai"
        ? "text-sm font-medium text-primary"
        : "text-sm font-medium text-foreground";

  let tile: ReactNode;
  if (role === "ai") {
    tile = hasToolBrandIcon(trimmed) ? (
      <AiTile label={trimmed} size={size} />
    ) : (
      <SegmentTile icon={AppWindow} tint="ai" size={size} />
    );
  } else if (Icon) {
    tile = <SegmentTile icon={Icon} size={size} />;
  } else if (isDomain(trimmed)) {
    tile = <SegmentTile icon={Globe} size={size} />;
  } else {
    tile = <SegmentTile icon={AppWindow} size={size} />;
  }

  if (!showLabel) {
    return (
      <span className="inline-flex" title={display}>
        {tile}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={display}>
      {tile}
      <span className={labelClass}>{display}</span>
    </span>
  );
}
