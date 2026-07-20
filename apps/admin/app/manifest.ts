import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/public/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: "UseJunction",
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#08758a",
    lang: "en",
    icons: [
      {
        src: "/icons/favicon-48.png",
        sizes: "48x48",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
