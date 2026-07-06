import { cn } from "@/lib/utils";

interface FeatureFlaticonProps {
  icon: string;
  className?: string;
}

export function FeatureFlaticon({ icon, className }: FeatureFlaticonProps) {
  return (
    <span
      className={cn(
        "fi inline-flex leading-none text-[var(--public-muted)] transition-all duration-200",
        "group-hover/feature:scale-110 group-hover/feature:text-[var(--public-accent)]",
        icon,
        className
      )}
      style={{ fontSize: "1.35rem" }}
      aria-hidden
    />
  );
}
