import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MobileDataList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      data-slot="mobile-data-list"
      className={cn("grid min-w-0 gap-3 md:hidden", className)}
      {...props}
    />
  );
}

export function MobileDataCard({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      data-slot="mobile-data-card"
      className={cn("min-w-0 border border-border/70 bg-card p-4", className)}
      {...props}
    />
  );
}

export function MobileDataField({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}
