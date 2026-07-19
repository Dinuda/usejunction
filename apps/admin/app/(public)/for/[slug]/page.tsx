import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/public/content-article";
import { getContentByKindAndSlug } from "@/content/registry";
import { FOR_PAGES } from "@/content/for";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FOR_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentByKindAndSlug("for", slug);
  if (!page) return {};
  return contentPageMetadata(page);
}

export default async function ForToolPage({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("for", slug);
  if (!page) notFound();
  return <ContentArticle page={page} />;
}
