import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/public/content-article";
import { getContentByKindAndSlug } from "@/content/registry";
import { GUIDES } from "@/content/guides";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getContentByKindAndSlug("guide", slug);
  if (!page) return {};
  return contentPageMetadata(page);
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("guide", slug);
  if (!page) notFound();
  return <ContentArticle page={page} />;
}
