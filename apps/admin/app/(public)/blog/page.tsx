import { BlogIndex } from "@/components/public/blog-index";
import { BLOG_POSTS } from "@/content/blog";
import { hubMetadata } from "@/lib/public/seo-metadata";
import { absoluteUrl } from "@/lib/public/site-url";

const base = hubMetadata({
  title: "AI Coding Observability Blog",
  description:
    "Field notes on AI coding observability, infrastructure, cost, privacy, and visibility before control.",
  path: "/blog",
});

export const metadata = {
  ...base,
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": absoluteUrl("/blog/rss.xml") },
  },
};

export default function BlogIndexPage() {
  return <BlogIndex posts={BLOG_POSTS} />;
}
