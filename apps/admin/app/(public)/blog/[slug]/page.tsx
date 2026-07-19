import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/public/content-article";
import { getContentByKindAndSlug } from "@/content/registry";
import { BLOG_POSTS } from "@/content/blog";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentByKindAndSlug("blog", slug);
  if (!page) return {};
  return contentPageMetadata(page);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("blog", slug);
  if (!page) notFound();
  return <ContentArticle page={page} />;
}
