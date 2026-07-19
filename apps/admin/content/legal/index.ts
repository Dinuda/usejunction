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
  answer: `${siteConfig.name} is designed for metadata-only observability by default. Prompts and responses are not stored by default. Self-hosted deployments keep request metadata on infrastructure you control.`,
  sections: [
    {
      heading: "What we collect (product default)",
      body: [
        "Device and agent heartbeats, tool and model identifiers, token counts, latency, status, and estimated cost metadata.",
        "Account data you provide when signing up for a hosted organization (email, org name, billing details as required).",
      ],
    },
    {
      heading: "What we do not collect by default",
      body: [
        "Prompt and response content.",
        "Keystrokes, screenshots, or browser surveillance.",
        "Full network interception of developer traffic.",
      ],
    },
    {
      heading: "Self-hosted deployments",
      body: [
        "When you self-host, telemetry stays on your systems subject to your own policies. Review the MIT-licensed source for exact behavior.",
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
  answer: `${siteConfig.name} software is available under the MIT license for self-hosting. Hosted Team and Enterprise services are subject to these terms and your order or subscription agreement.`,
  sections: [
    {
      heading: "Open-source software",
      body: [
        "The UseJunction codebase is licensed under MIT. See the LICENSE file in the repository. Self-hosting is at your own operational risk subject to that license.",
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
