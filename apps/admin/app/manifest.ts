import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/public/config";
import { manifestIcons } from "@/lib/public/site-icons";

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
    icons: [...manifestIcons],
  };
}
