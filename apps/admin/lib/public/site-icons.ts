import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/public/site-url";

/** Stable public paths for brand icons (also served from /public). */
export const siteIconPaths = {
  favicon: "/favicon.ico",
  favicon16: "/icons/favicon-16.png",
  favicon32: "/icons/favicon-32.png",
  favicon48: "/icons/favicon-48.png",
  favicon96: "/icons/favicon-96.png",
  favicon192: "/icons/icon-192.png",
  favicon512: "/icons/icon-512.png",
  appleTouch: "/icons/apple-touch-180.png",
} as const;

/**
 * Favicon metadata for crawlers (Google Search, etc.).
 * Use absolute canonical URLs so www → apex redirects do not break icon discovery.
 * PNG/ICO only — Google Search does not use SVG favicons.
 */
export const siteIcons: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: absoluteUrl(siteIconPaths.favicon), sizes: "16x16", type: "image/x-icon" },
    { url: absoluteUrl(siteIconPaths.favicon16), sizes: "16x16", type: "image/png" },
    { url: absoluteUrl(siteIconPaths.favicon32), sizes: "32x32", type: "image/png" },
    { url: absoluteUrl(siteIconPaths.favicon48), sizes: "48x48", type: "image/png" },
    { url: absoluteUrl(siteIconPaths.favicon96), sizes: "96x96", type: "image/png" },
    { url: absoluteUrl(siteIconPaths.favicon192), sizes: "192x192", type: "image/png" },
  ],
  shortcut: absoluteUrl(siteIconPaths.favicon),
  apple: [{ url: absoluteUrl(siteIconPaths.appleTouch), sizes: "180x180", type: "image/png" }],
};

export const manifestIcons = [
  {
    src: absoluteUrl(siteIconPaths.favicon48),
    sizes: "48x48",
    type: "image/png",
    purpose: "any",
  },
  {
    src: absoluteUrl(siteIconPaths.favicon96),
    sizes: "96x96",
    type: "image/png",
    purpose: "any",
  },
  {
    src: absoluteUrl(siteIconPaths.favicon192),
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: absoluteUrl(siteIconPaths.favicon512),
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
] as const;
