"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Github, Menu, X } from "lucide-react";
import usejunctionLogo from "@/public/usejunction.png";
import { navAnchors, siteConfig } from "@/lib/public/config";

interface MarketingTopNavProps {
  isAuthenticated: boolean;
}

export function MarketingTopNav({ isAuthenticated }: MarketingTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 48);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToAnchor = useCallback(
    (id: string) => {
      setMobileOpen(false);

      function attemptScroll(retries = 0) {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
          return;
        }
        if (retries < 20) {
          setTimeout(() => attemptScroll(retries + 1), 50);
        }
      }

      if (pathname !== "/") {
        router.push(`/#${id}`);
        setTimeout(() => attemptScroll(), 100);
      } else {
        attemptScroll();
      }
    },
    [pathname, router]
  );

  useEffect(() => {
    if (pathname === "/" && window.location.hash) {
      const id = window.location.hash.slice(1);
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [pathname]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled ? "var(--public-surface)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--public-border)" : "1px solid transparent",
      }}
    >
      <div className="public-container flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="inline-flex h-10 items-center md:justify-self-start">
          <img
            src={usejunctionLogo.src}
            alt={siteConfig.name}
            width={usejunctionLogo.width}
            height={usejunctionLogo.height}
            className="h-12 w-auto"
          />
        </Link>

        <nav className="hidden h-10 items-center gap-8 md:flex md:justify-self-center">
          {navAnchors.map((anchor) => (
            <button
              key={anchor.id}
              type="button"
              onClick={() => scrollToAnchor(anchor.id)}
              className="inline-flex h-10 items-center text-sm leading-none text-[var(--public-muted)] transition-colors hover:text-[var(--public-fg)]"
            >
              {anchor.label}
            </button>
          ))}
        </nav>

        <div className="hidden h-10 items-center gap-3 md:flex md:justify-self-end">
          <a
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="public-btn public-btn-outline"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
          {isAuthenticated ? (
            <Link href="/dashboard" className="public-btn public-btn-primary">
              Dashboard
            </Link>
          ) : (
            <a href={siteConfig.docsUrl} className="public-btn public-btn-primary">
              Deploy
            </a>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="border-t md:hidden"
          style={{ borderColor: "var(--public-border)", background: "var(--public-surface)" }}
        >
          <nav className="public-container flex flex-col gap-4 py-4">
            {navAnchors.map((anchor) => (
              <button
                key={anchor.id}
                type="button"
                onClick={() => scrollToAnchor(anchor.id)}
                className="text-left text-sm"
              >
                {anchor.label}
              </button>
            ))}
            <a
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="public-btn public-btn-outline text-center text-sm"
            >
              GitHub
            </a>
            {isAuthenticated ? (
              <Link href="/dashboard" className="public-btn public-btn-primary text-center text-sm">
                Dashboard
              </Link>
            ) : (
              <a href={siteConfig.docsUrl} className="public-btn public-btn-primary text-center text-sm">
                Deploy
              </a>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
