import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusBadgeVariant = "default" | "success" | "warning" | "error";

const variantClasses: Record<StatusBadgeVariant, string> = {
  default: "border-border bg-muted text-muted-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-[#9a5f0d]",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function StatusBadge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[0.65rem] uppercase tracking-[0.08em]", variantClasses[variant], className)}
    >
      {children}
    </Badge>
  );
}
