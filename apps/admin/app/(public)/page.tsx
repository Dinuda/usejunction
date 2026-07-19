import type { Metadata } from "next";
import { UseJunctionHomeContent } from "@/components/public/use-junction-home-content";
import { siteConfig } from "@/lib/public/config";
import { absoluteUrl } from "@/lib/public/site-url";

export const metadata: Metadata = {
  title: { absolute: siteConfig.seoTitle },
  description: siteConfig.description,
  alternates: {
    canonical: absoluteUrl("/"),
  },
  openGraph: {
    title: siteConfig.seoTitle,
    description: siteConfig.description,
    url: absoluteUrl("/"),
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.seoTitle,
    description: siteConfig.description,
  },
};

export default function HomePage() {
  return <UseJunctionHomeContent />;
}
