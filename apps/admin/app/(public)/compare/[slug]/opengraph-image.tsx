import { getContentByKindAndSlug } from "@/content/registry";
import { renderOgImage, ogSize } from "@/lib/public/og-image";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "UseJunction comparison";

type Props = { params: Promise<{ slug: string }> };

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("compare", slug);
  return renderOgImage({
    title: page?.title ?? "Compare UseJunction",
    subtitle: page?.description ?? "AI coding observability comparisons",
  });
}
