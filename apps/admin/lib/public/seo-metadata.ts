import type { Metadata } from "next";
import type { ContentPage } from "@/content/types";
import { absoluteUrl, getSiteUrl } from "@/lib/public/site-url";
import { siteConfig } from "@/lib/public/config";

/** Static screenshot of the live homepage — used for link previews in chat/social apps. */
export const siteOgImage = {
  url: "/og-home.png",
  width: 1404,
  height: 907,
  alt: `${siteConfig.name} homepage`,
} as const;

export function contentPageMetadata(page: ContentPage): Metadata {
  const url = absoluteUrl(page.path);
  return {
    title: page.title,
    description: page.description,
    keywords: [page.primaryKeyword, ...page.secondaryKeywords],
    alternates: { canonical: url },
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: siteConfig.name,
      type: page.kind === "blog" ? "article" : "website",
      locale: "en_US",
      images: [siteOgImage],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [siteOgImage.url],
    },
    robots: { index: true, follow: true },
  };
}

export function hubMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: siteConfig.name,
      type: "website",
      images: [siteOgImage],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [siteOgImage.url],
    },
  };
}

export { absoluteUrl, getSiteUrl };
