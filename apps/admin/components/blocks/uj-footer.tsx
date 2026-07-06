import Link from "next/link";
import { cn } from "@/lib/utils";

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

interface UjFooterProps {
  name: string;
  tagline: string;
  columns: FooterColumn[];
  copyright: string;
  className?: string;
}

/** Adapted from shadcnblocks Footer2 — multi-column footer */
export function UjFooter({ name, tagline, columns, copyright, className }: UjFooterProps) {
  return (
    <footer className={cn("border-t py-16", className)} style={{ borderColor: "var(--public-border)" }}>
      <div className="container">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <span className="font-semibold">{name}</span>
            <p className="mt-2 text-sm text-muted-foreground">{tagline}</p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-sm font-semibold">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 text-xs text-muted-foreground public-mono">{copyright}</p>
      </div>
    </footer>
  );
}
