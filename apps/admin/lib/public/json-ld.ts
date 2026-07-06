import { siteConfig } from "@/lib/public/config";

export function buildJsonLd() {
  const baseUrl = siteConfig.url;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.name,
      url: baseUrl,
      description: siteConfig.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, macOS, Linux",
      description: siteConfig.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Open source, self-hostable",
      },
      license: siteConfig.license,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteConfig.name,
      url: baseUrl,
      description: siteConfig.tagline,
    },
  ];
}
