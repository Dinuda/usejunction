import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  accent?: "cyan" | "yellow";
};

export function AuthShell({
  title,
  description,
  children,
  footer,
  accent = "cyan",
}: AuthShellProps) {
  return (
    <div className="auth-shell grid min-h-svh bg-background lg:grid-cols-2">
      <section className="flex min-h-svh flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <a href="/" className="flex w-fit items-center" aria-label="UseJunction home">
          <BrandLogo className="h-9 sm:h-10" />
        </a>
        <div className="flex flex-1 items-center justify-center py-14 sm:py-20">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">{title}</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="font-mono text-[0.68rem] text-muted-foreground">Open source · self-hosted · MIT licensed</p>
        {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
      </section>
      <aside
        className={cn(
          "uj-grid-texture relative hidden overflow-hidden border-l p-10 lg:block",
          accent === "yellow"
            ? "border-border bg-brand-yellow text-brand-yellow-dark [--uj-grid-opacity:0.09]"
            : "border-primary-dark bg-primary text-primary-foreground [--uj-grid-opacity:0.1]",
        )}
        aria-hidden="true"
      >
        <div className="relative flex h-full items-end">
          <p className="max-w-xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em]">
            {accent === "yellow" ? "Make model decisions based on evidence." : "Visibility before control."}
          </p>
        </div>
      </aside>
    </div>
  );
}

export function AuthFrame({ children, title, description }: { children: React.ReactNode; title: string; description: string }) {
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
        <p className="font-mono text-[0.68rem] text-muted-foreground">Open source · self-hosted · MIT licensed</p>
      </div>
    </div>
  );
}
