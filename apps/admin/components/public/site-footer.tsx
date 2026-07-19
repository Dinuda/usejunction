import Link from "next/link";
import { Github } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { siteConfig, FOOTER_COLUMNS } from "@/lib/public/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-5 sm:py-14 lg:grid-cols-[1fr_2fr] lg:px-8">
        <div>
          <BrandLogo className="h-9" />
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
            {siteConfig.tagline}. Self-hosted, open source, and built for teams that want context before
            control.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Product", FOOTER_COLUMNS.product],
              ["Learn", FOOTER_COLUMNS.learn],
              ["Community", FOOTER_COLUMNS.community],
              ["Legal", FOOTER_COLUMNS.license],
            ] as const
          ).map(([title, links]) => (
            <div key={title}>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
              <div className="mt-4 grid gap-3 text-sm">
                {links.map((link) => (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className="flex w-fit items-center gap-2 hover:text-primary"
                    {...(link.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label === "GitHub" ? <Github className="size-4" /> : null}
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 border-t border-border px-4 py-5 font-mono text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5 lg:px-8">
        <span>
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </span>
        <Link href="/llms.txt" className="hover:text-primary">
          llms.txt
        </Link>
      </div>
    </footer>
  );
}
