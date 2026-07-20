import type { ContentPage } from "@/content/types";
import { siteConfig } from "@/lib/public/config";

export const privacyPage: ContentPage = {
  kind: "legal",
  slug: "privacy",
  path: "/privacy",
  title: "Privacy Policy",
  description: `How ${siteConfig.name} handles data for the open-source AI coding observability product and hosted service.`,
  primaryKeyword: "UseJunction privacy",
  secondaryKeywords: [],
  updatedAt: "2026-07-19",
  answer: `${siteConfig.name} is designed privacy-first: observability second. Self-hosted deployments keep data on infrastructure you control. Richer work detail is optional and can be turned off.`,
  sections: [
    {
      heading: "What we collect (product default)",
      body: [
        "Device and agent heartbeats, tool and model identifiers, token counts, latency, status, and estimated cost signals.",
        "Optional Signals work context when enabled for your organization.",
        "Account data you provide when signing up for a hosted organization (email, org name, billing details as required).",
      ],
    },
    {
      heading: "What we do not collect",
      body: [
        "Keystrokes, screenshots, or browser surveillance.",
        "Full network interception of developer traffic.",
      ],
    },
    {
      heading: "Self-hosted deployments",
      body: [
        "When you self-host, telemetry stays on your systems subject to your own policies. Review the source under the UseJunction Community License for exact behavior.",
      ],
    },
    {
      heading: "Contact",
      body: [`Privacy questions: hello@usejunction.dev`],
    },
  ],
  faq: [],
  relatedPaths: ["/terms", "/"],
};

export const termsPage: ContentPage = {
  kind: "legal",
  slug: "terms",
  path: "/terms",
  title: "Terms of Service",
  description: `Terms for using ${siteConfig.name} software and hosted services.`,
  primaryKeyword: "UseJunction terms",
  secondaryKeywords: [],
  updatedAt: "2026-07-19",
  answer: `${siteConfig.name} software is available under the UseJunction Community License for self-hosting. Hosted Team and Enterprise services are subject to these terms and your order or subscription agreement.`,
  sections: [
    {
      heading: "Open-source software",
      body: [
        "The UseJunction codebase is licensed under the UseJunction Community License (Apache 2.0–based with additional commercial terms). See the LICENSE file in the repository. Self-hosting is at your own operational risk subject to that license.",
      ],
    },
    {
      heading: "Hosted service",
      body: [
        "Paid Team and Enterprise plans are billed per your checkout or contract. Trials convert according to product entitlements unless canceled.",
        "You are responsible for lawful use, accurate account information, and the content of data you choose to retain beyond defaults.",
      ],
    },
    {
      heading: "Disclaimer",
      body: [
        "Software and hosted services are provided as available. We do not warrant uninterrupted operation. Limit liability to fees paid in the prior twelve months where permitted by law.",
      ],
    },
    {
      heading: "Contact",
      body: ["Questions: hello@usejunction.dev"],
    },
  ],
  faq: [],
  relatedPaths: ["/privacy", "/"],
};

export const LEGAL_PAGES: ContentPage[] = [privacyPage, termsPage];
