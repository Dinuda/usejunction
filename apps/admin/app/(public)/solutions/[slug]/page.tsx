import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/public/content-article";
import { SOLUTIONS } from "@/content/solutions";
import { getContentByKindAndSlug } from "@/content/registry";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return SOLUTIONS.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentByKindAndSlug("solution", slug);
  if (!page) return {};
  return contentPageMetadata(page);
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("solution", slug);
  if (!page) notFound();
  return <ContentArticle page={page} />;
}
