"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Github, Menu, X } from "lucide-react";
import usejunctionLogo from "@/public/usejunction.png";
import { navAnchors, navLinks, siteConfig } from "@/lib/public/config";

interface MarketingTopNavProps {
  isAuthenticated: boolean;
}

export function MarketingTopNav({ isAuthenticated }: MarketingTopNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled ? "var(--public-surface)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--public-border)" : "1px solid transparent",
      }}
    >
      <div className="public-container flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="inline-flex h-10 items-center md:justify-self-start" aria-label="UseJunction home">
          <Image
            src={usejunctionLogo}
            alt={siteConfig.name}
            width={usejunctionLogo.width}
            height={usejunctionLogo.height}
            priority
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        <nav className="hidden h-10 items-center gap-8 md:flex md:justify-self-center" aria-label="Primary navigation">
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
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex h-10 items-center text-sm leading-none text-[var(--public-muted)] transition-colors hover:text-[var(--public-fg)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden h-10 items-center gap-3 md:flex md:justify-self-end">
          {isAuthenticated ? null : (
            <Link
              href="/login"
              className="inline-flex h-10 items-center text-sm leading-none text-[var(--public-muted)] transition-colors hover:text-[var(--public-fg)]"
            >
              Sign in
            </Link>
          )}
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
            <Link href={siteConfig.signupUrl} className="public-btn public-btn-primary">
              Get started
            </Link>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-primary-navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          id="mobile-primary-navigation"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t md:hidden"
          style={{ borderColor: "var(--public-border)", background: "var(--public-surface)" }}
        >
          <nav className="public-container flex flex-col gap-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label="Mobile navigation">
            {navAnchors.map((anchor) => (
              <button
                key={anchor.id}
                type="button"
                onClick={() => scrollToAnchor(anchor.id)}
                className="flex min-h-11 items-center px-1 text-left text-sm"
              >
                {anchor.label}
              </button>
            ))}
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-11 items-center px-1 text-left text-sm"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? null : (
              <Link
                href="/login"
                className="flex min-h-11 items-center px-1 text-left text-sm"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
            )}
            <a
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="public-btn public-btn-outline mt-2 w-full text-center text-sm"
            >
              GitHub
            </a>
            {isAuthenticated ? (
              <Link href="/dashboard" className="public-btn public-btn-primary w-full text-center text-sm">
                Dashboard
              </Link>
            ) : (
              <Link href={siteConfig.signupUrl} className="public-btn public-btn-primary w-full text-center text-sm">
                Get started
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
