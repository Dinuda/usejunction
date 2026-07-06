import { cn } from "@/lib/utils";

interface CtaButton {
  text: string;
  url: string;
}

interface UjCtaProps {
  heading: string;
  description: string;
  primary?: CtaButton;
  secondary?: CtaButton;
  className?: string;
}

/** Adapted from shadcnblocks Cta10 — banded dual-button CTA */
export function UjCta({ heading, description, primary, secondary, className }: UjCtaProps) {
  return (
    <section className={cn("public-section", className)} style={{ borderBottom: "none" }}>
      <div className="container">
        <div
          className="flex w-full flex-col gap-8 border p-8 lg:flex-row lg:items-center lg:justify-between lg:p-12"
          style={{
            borderColor: "var(--public-border)",
            background: "color-mix(in srgb, var(--public-accent) 6%, var(--public-surface))",
          }}
        >
          <div className="flex flex-1 flex-col gap-3">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h2>
            <p className="max-w-xl text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {secondary && (
              <a href={secondary.url} className="public-btn public-btn-outline text-sm">
                {secondary.text}
              </a>
            )}
            {primary && (
              <a href={primary.url} className="public-btn public-btn-primary text-sm">
                {primary.text}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
