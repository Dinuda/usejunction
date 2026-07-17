import { cn } from "@/lib/utils";
import {
  WORKSPACE_COLORS,
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
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Workspace color">
      {WORKSPACE_COLORS.map((swatch) => {
        const selected = swatch === value;
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(swatch)}
            className={cn(
              "size-7 rounded-md border-2 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
              selected ? "border-foreground shadow-sm" : "border-transparent hover:border-border",
            )}
            style={{ backgroundColor: swatch }}
            aria-label={`Color ${swatch}`}
          />
        );
      })}
    </div>
  );
}
