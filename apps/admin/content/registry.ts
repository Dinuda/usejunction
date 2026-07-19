import { BLOG_POSTS } from "@/content/blog";
import { COMPARE_PAGES } from "@/content/compare";
import { FOR_PAGES } from "@/content/for";
import { GUIDES } from "@/content/guides";
import { LEGAL_PAGES } from "@/content/legal";
import type { ContentPage, SitemapEntry } from "@/content/types";

export const ALL_CONTENT_PAGES: ContentPage[] = [
  ...GUIDES,
  ...COMPARE_PAGES,
  ...FOR_PAGES,
  ...BLOG_POSTS,
  ...LEGAL_PAGES,
];

export function getContentByPath(path: string): ContentPage | undefined {
  return ALL_CONTENT_PAGES.find((page) => page.path === path);
}

export function getContentByKindAndSlug(
  kind: ContentPage["kind"],
  slug: string,
): ContentPage | undefined {
  return ALL_CONTENT_PAGES.find((page) => page.kind === kind && page.slug === slug);
}

export function getRelatedPages(page: ContentPage): ContentPage[] {
  return page.relatedPaths
    .map((path) => getContentByPath(path))
    .filter((item): item is ContentPage => Boolean(item));
}

const HUB_BY_KIND: Record<ContentPage["kind"], { label: string; href: string } | null> = {
  guide: { label: "Guides", href: "/guides" },
  compare: { label: "Compare", href: "/compare" },
  for: { label: "For tools", href: "/for" },
  blog: { label: "Blog", href: "/blog" },
  legal: null,
};

export function contentBreadcrumbs(page: ContentPage): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/" }];
  const hub = HUB_BY_KIND[page.kind];
  if (hub) crumbs.push(hub);
  crumbs.push({ label: page.title });
  return crumbs;
}

export function buildSitemapEntries(): SitemapEntry[] {
  const home: SitemapEntry = {
    path: "/",
    lastModified: "2026-07-19",
    changeFrequency: "weekly",
    priority: 1,
  };

  const hubs: SitemapEntry[] = [
    { path: "/guides", lastModified: "2026-07-19", changeFrequency: "weekly", priority: 0.8 },
    { path: "/compare", lastModified: "2026-07-19", changeFrequency: "weekly", priority: 0.8 },
    { path: "/for", lastModified: "2026-07-19", changeFrequency: "weekly", priority: 0.8 },
    { path: "/blog", lastModified: "2026-07-19", changeFrequency: "weekly", priority: 0.7 },
    { path: "/contact", lastModified: "2026-07-19", changeFrequency: "monthly", priority: 0.5 },
  ];

  const pages = ALL_CONTENT_PAGES.map((page) => ({
    path: page.path,
    lastModified: page.updatedAt,
    changeFrequency: (page.kind === "legal" ? "yearly" : "monthly") as SitemapEntry["changeFrequency"],
    priority: page.kind === "legal" ? 0.3 : page.kind === "blog" ? 0.6 : 0.7,
  }));

  return [home, ...hubs, ...pages];
}

/** Priority cite URLs for answer engines */
export const AEO_CITE_PATHS = [
  "/",
  "/guides/see-plan-usage-and-waste",
  "/guides/see-team-ai-coding-usage",
  "/guides/open-source-wakatime-alternative-for-ai-coding",
  "/compare/wakatime",
  "/for/cursor",
  "/for/claude-code",
  "/privacy",
] as const;
