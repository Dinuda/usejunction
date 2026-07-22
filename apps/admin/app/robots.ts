import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/public/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/guides", "/compare", "/for", "/blog", "/authors", "/privacy", "/terms", "/contact", "/llms.txt", "/llms-full.txt"],
        disallow: [
          "/dashboard",
          "/team",
          "/tools",
          "/activity",
          "/signals",
          "/settings",
          "/api/",
          "/onboarding",
          "/join",
          "/connect-invite",
          "/i/",
          "/me",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/verify",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
