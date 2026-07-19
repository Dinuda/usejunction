import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/public/content-article";
import { getContentByKindAndSlug } from "@/content/registry";
import { COMPARE_PAGES } from "@/content/compare";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COMPARE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentByKindAndSlug("compare", slug);
  if (!page) return {};
  return contentPageMetadata(page);
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("compare", slug);
  if (!page) notFound();
  return <ContentArticle page={page} />;
}
