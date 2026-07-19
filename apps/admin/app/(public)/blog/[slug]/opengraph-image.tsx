import { getContentByKindAndSlug } from "@/content/registry";
import { renderOgImage, ogSize } from "@/lib/public/og-image";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "UseJunction blog";

type Props = { params: Promise<{ slug: string }> };

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("blog", slug);
  return renderOgImage({
    title: page?.title ?? "UseJunction Blog",
    subtitle: page?.description ?? "AI coding observability",
  });
}
