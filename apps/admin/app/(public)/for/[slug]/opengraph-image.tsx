import { getContentByKindAndSlug } from "@/content/registry";
import { renderOgImage, ogSize } from "@/lib/public/og-image";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "UseJunction for AI coding tools";

type Props = { params: Promise<{ slug: string }> };

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const page = getContentByKindAndSlug("for", slug);
  return renderOgImage({
    title: page?.title ?? "AI coding tool usage",
    subtitle: page?.description ?? "Team usage, cost, and plan utilization",
  });
}
