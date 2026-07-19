import { ContentHub } from "@/components/public/content-hub";
import { BLOG_POSTS } from "@/content/blog";
import { hubMetadata } from "@/lib/public/seo-metadata";
import { absoluteUrl } from "@/lib/public/site-url";

const base = hubMetadata({
  title: "Blog",
  description:
    "Essays on AI coding observability, visibility before control, and stopping seat waste before renewal.",
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
  return (
    <ContentHub
      title="Blog"
      description="Operating notes for platform teams running AI coding tools at scale."
      path="/blog"
      items={BLOG_POSTS.map((post) => ({
        title: post.title,
        description: post.description,
        path: post.path,
      }))}
    />
  );
}
