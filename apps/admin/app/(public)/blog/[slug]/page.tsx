import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticle } from "@/components/public/blog-article";
import { BLOG_POSTS, getBlogPostBySlug } from "@/content/blog";
import { blogPostMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return blogPostMetadata(post);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();
  return <BlogArticle post={post} />;
}
