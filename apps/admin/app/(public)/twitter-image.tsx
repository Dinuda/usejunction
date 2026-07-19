import { renderOgImage, ogSize } from "@/lib/public/og-image";
import { siteConfig } from "@/lib/public/config";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = ogSize;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderOgImage({
    title: "AI coding observability for teams",
    subtitle: "Plan usage, tool insights, and device health — open source",
  });
}
