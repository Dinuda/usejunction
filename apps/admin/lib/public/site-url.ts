import { siteConfig } from "@/lib/public/config";

/** Canonical public site origin (no trailing slash). */
export function getSiteUrl(): string {
  const raw = siteConfig.url.trim() || "https://usejunction.dev";
  return raw.replace(/\/$/, "");
}

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
