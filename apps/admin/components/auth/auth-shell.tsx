import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  accent?: "cyan" | "yellow";
  /** Optional mono label above the title (onboarding paths). */
  eyebrow?: string;
  /** Form column width. Login/signup stay `sm`; onboarding needs `md`. */
  size?: "sm" | "md";
  /** Vertical placement of the form block. Onboarding reads better top-aligned. */
  contentAlign?: "center" | "top";
  /** Override the right-panel statement. Defaults by accent. */
  statement?: string;
};

const sizeClass = {
  sm: "max-w-sm",
  md: "max-w-md",
} as const;

export function AuthShell({
  title,
  description,
  children,
  footer,
  accent = "cyan",
  eyebrow,
  size = "sm",
  contentAlign = "center",
  statement,
}: AuthShellProps) {
  const panelCopy =
    statement ??
    (accent === "yellow" ? "Make model decisions based on evidence." : "Visibility before control.");

  return (
    <div className="auth-shell grid min-h-svh bg-background lg:grid-cols-2">
      <section className="flex min-h-svh flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <a href="/" className="flex w-fit items-center" aria-label="UseJunction home">
          <BrandLogo className="h-9 sm:h-10" />
        </a>
        <div
          className={cn(
            "flex flex-1 justify-center",
            contentAlign === "top"
              ? "items-center pb-15"
              : "items-center py-14 sm:py-20",
          )}
        >
          <div className={cn("w-full", sizeClass[size])}>
            {eyebrow ? (
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
            ) : null}
            <h1
              className={cn(
                "text-3xl font-semibold tracking-tight sm:text-[2.15rem]",
                eyebrow ? "mt-4" : undefined,
              )}
            >
              {title}
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="font-mono text-[0.68rem] text-muted-foreground">Source available · self-hosted · Community License</p>
        {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
      </section>
      <aside
        className={cn(
          "uj-grid-texture uj-grid-texture-strong relative hidden overflow-hidden border-l p-10 lg:block [--uj-grid-size:3rem]",
          accent === "yellow"
            ? "border-border bg-brand-yellow text-brand-yellow-dark [--uj-grid-opacity:0.12]"
            : "border-primary-dark bg-primary text-primary-foreground [--uj-grid-opacity:0.12]",
        )}
        aria-hidden="true"
      >
        <div className="relative flex h-full items-end">
          <p className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em]">{panelCopy}</p>
        </div>
      </aside>
    </div>
  );
}

export function AuthFrame({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="auth-shell min-h-svh bg-muted/30 px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-5xl flex-col">
        <a href="/" className="flex w-fit items-center" aria-label="UseJunction home">
          <BrandLogo className="h-9 sm:h-10" />
        </a>
        <main className="flex flex-1 items-center justify-center py-12 sm:py-16">
          <div className="w-full max-w-lg">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </main>
        <p className="font-mono text-[0.68rem] text-muted-foreground">Source available · self-hosted · Community License</p>
      </div>
    </div>
  );
}
