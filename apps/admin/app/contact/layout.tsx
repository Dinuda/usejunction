import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/public/site-url";
import { siteConfig } from "@/lib/public/config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Contact ${siteConfig.name} about enterprise deployment, retention, and Team plans for AI coding observability.`,
  alternates: { canonical: absoluteUrl("/contact") },
  openGraph: {
    title: `Contact — ${siteConfig.name}`,
    description: `Talk to ${siteConfig.name} about enterprise AI coding observability.`,
    url: absoluteUrl("/contact"),
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
