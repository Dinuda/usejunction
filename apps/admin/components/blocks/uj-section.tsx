import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UjSectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  narrow?: boolean;
  band?: boolean;
}

/** shadcnblocks-inspired section shell — content-agnostic */
export function UjSection({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
  narrow,
  band,
}: UjSectionProps) {
  return (
    <section
      id={id}
      className={cn("public-section scroll-mt-20", band && "uj-band", className)}
    >
      <div className={cn("container", narrow && "max-w-3xl")}>
        {eyebrow && <p className="public-eyebrow mb-4">{eyebrow}</p>}
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        {description && (
          <div className="mt-4 text-lg text-muted-foreground">{description}</div>
        )}
        {children}
      </div>
    </section>
  );
}

interface UjCardGridProps {
  columns?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}

export function UjCardGrid({ columns = 3, children, className }: UjCardGridProps) {
  const colClass =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "lg:grid-cols-3";

  return (
    <div
      className={cn("mt-12 grid gap-px", colClass, className)}
      style={{ background: "var(--public-border)" }}
    >
      {children}
    </div>
  );
}

export function UjCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("border-0 bg-[var(--public-surface)] p-6", className)}
    >
      {children}
    </div>
  );
}
