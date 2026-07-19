"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_COLORS,
  WORKSPACE_COLOR_LABELS,
  resolveWorkspaceColor,
  type WorkspaceColor,
} from "@/lib/workspace-colors";

const sizeClass = {
  sm: "size-5",
  md: "size-6",
  lg: "size-8",
} as const;

export function WorkspaceIcon({
  id,
  color,
  size = "sm",
  className,
}: {
  id: string;
  color?: string | null;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const resolved = resolveWorkspaceColor(id, color);

  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-md", sizeClass[size], className)}
      style={{ backgroundColor: resolved }}
    />
  );
}

export function WorkspaceColorSwatches({
  value,
  onChange,
  disabled,
}: {
  value: WorkspaceColor;
  onChange: (color: WorkspaceColor) => void;
  disabled?: boolean;
}) {
  const groupName = useId();

  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Workspace color">
      {WORKSPACE_COLORS.map((swatch) => {
        const selected = swatch === value;
        return (
          <label key={swatch} className="relative grid size-11 cursor-pointer place-items-center">
            <input
              type="radio"
              name={groupName}
              value={swatch}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(swatch)}
              className="peer sr-only"
              aria-label={WORKSPACE_COLOR_LABELS[swatch]}
            />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 place-items-center rounded-md border-2 transition-all peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50",
                selected
                  ? "border-foreground shadow-sm"
                  : "border-transparent hover:border-border-strong",
              )}
              style={{ backgroundColor: swatch }}
            >
              {selected ? <Check className="size-4 text-white drop-shadow-sm" strokeWidth={3} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
