import type { MetadataRoute } from "next";
import { buildSitemapEntries } from "@/content/registry";
import { absoluteUrl } from "@/lib/public/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries().map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
