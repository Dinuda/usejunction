import type { ContentPage } from "@/content/types";

export const compareWakatime: ContentPage = {
  kind: "compare",
  slug: "wakatime",
  path: "/compare/wakatime",
  title: "UseJunction vs WakaTime",
  description:
    "Compare UseJunction and WakaTime: AI coding observability and plan usage versus editor time tracking. Choose the right tool for the job.",
  primaryKeyword: "UseJunction vs WakaTime",
  secondaryKeywords: ["WakaTime alternative AI coding", "open source WakaTime alternative"],
  updatedAt: "2026-07-19",
  answer:
    "WakaTime measures coding time and language activity. UseJunction measures AI coding tool usage, cost, plan/seat utilization, latency, and device health. They solve different jobs; many teams that search for a WakaTime alternative today actually need AI observability.",
  compareOtherName: "WakaTime",
  compareRows: [
    { feature: "Primary job", usejunction: "AI coding observability", other: "Editor time tracking" },
    { feature: "AI tool & model usage", usejunction: "Yes — org-wide", other: "Not the focus" },
    { feature: "Plan / seat utilization", usejunction: "Yes — cycle views", other: "No" },
    { feature: "Cost & latency attribution", usejunction: "Yes", other: "No" },
    { feature: "Hours by project/language", usejunction: "No", other: "Yes" },
    { feature: "Self-hosted open source", usejunction: "Community License self-host", other: "Primarily SaaS plugins" },
    { feature: "Prompt storage", usejunction: "Not by default", other: "N/A (not LLM telemetry)" },
  ],
  sections: [
    {
      heading: "Pick UseJunction when",
      body: [
        "You need to see Cursor, Claude Code, Copilot, and local model usage across the org.",
        "You care about seat waste, quota pressure, and personal vs company keys.",
      ],
    },
    {
      heading: "Pick WakaTime when",
      body: [
        "You need fine-grained time-in-editor metrics by project and language.",
        "AI spend and tool fleet visibility are not your primary question.",
      ],
    },
  ],
  faq: [
    {
      question: "Can UseJunction replace WakaTime?",
      answer:
        "Only if your goal shifted from time tracking to AI coding observability. For hours-based productivity metrics, keep WakaTime (or similar) and add UseJunction for AI tools.",
    },
  ],
  relatedPaths: [
    "/guides/open-source-wakatime-alternative-for-ai-coding",
    "/guides/see-team-ai-coding-usage",
    "/compare/helicone",
  ],
};

export const compareHelicone: ContentPage = {
  kind: "compare",
  slug: "helicone",
  path: "/compare/helicone",
  title: "UseJunction vs Helicone",
  description:
    "Helicone focuses on LLM gateway observability. UseJunction focuses on AI coding tools on developer devices—usage, plans, and fleet health.",
  primaryKeyword: "UseJunction vs Helicone",
  secondaryKeywords: ["AI coding observability vs LLM gateway"],
  updatedAt: "2026-07-19",
  answer:
    "Helicone is strong for request-level LLM observability through a gateway or proxy. UseJunction is built for platform teams that need visibility into AI coding tools on laptops—adoption, plan utilization, device health, and cost attribution—often without forcing all traffic through a central gateway first.",
  compareOtherName: "Helicone",
  compareRows: [
    { feature: "Primary surface", usejunction: "Developer devices + AI coding tools", other: "LLM gateway / proxy" },
    { feature: "Cursor / IDE agents", usejunction: "First-class", other: "Indirect if proxied" },
    { feature: "Seat / plan utilization", usejunction: "Yes", other: "Not the core job" },
    { feature: "Device enrollment health", usejunction: "Yes", other: "No" },
  ],
  sections: [
    {
      heading: "Complementary stacks",
      body: [
        "Some orgs run a gateway for server-side LLM apps and UseJunction for coding-tool fleets. Visibility before control still applies.",
      ],
    },
  ],
  faq: [
    {
      question: "Do I need a gateway to use UseJunction?",
      answer:
        "No. Start with the local agent and usage signals. Gateway-style control is optional roadmap after you have context.",
    },
  ],
  relatedPaths: ["/compare/portkey", "/compare/langfuse", "/guides/see-team-ai-coding-usage"],
};

export const comparePortkey: ContentPage = {
  kind: "compare",
  slug: "portkey",
  path: "/compare/portkey",
  title: "UseJunction vs Portkey",
  description:
    "Portkey is an AI gateway and control plane. UseJunction starts with observability of AI coding tools across your eng org.",
  primaryKeyword: "UseJunction vs Portkey",
  secondaryKeywords: ["AI gateway vs AI coding observability"],
  updatedAt: "2026-07-19",
  answer:
    "Portkey emphasizes routing, guardrails, and gateway control for LLM traffic. UseJunction emphasizes seeing which AI coding tools your team actually uses—cost, plans, and device health—before you impose control.",
  compareOtherName: "Portkey",
  compareRows: [
    { feature: "Control vs visibility first", usejunction: "Visibility before control", other: "Gateway control plane" },
    { feature: "Coding-tool fleet", usejunction: "Native focus", other: "If traffic is gated" },
    { feature: "Open-source self-host coding ops", usejunction: "Community License product focus", other: "Different product shape" },
  ],
  sections: [
    {
      heading: "When UseJunction fits",
      body: [
        "You do not yet know tool sprawl, personal keys, or seat waste—and need evidence before routing or policy.",
      ],
    },
  ],
  faq: [],
  relatedPaths: ["/compare/helicone", "/compare/langfuse", "/"],
};

export const compareLangfuse: ContentPage = {
  kind: "compare",
  slug: "langfuse",
  path: "/compare/langfuse",
  title: "UseJunction vs Langfuse",
  description:
    "Langfuse is LLM tracing and evals for applications. UseJunction is open-source AI coding observability for teams.",
  primaryKeyword: "UseJunction vs Langfuse",
  secondaryKeywords: ["LLM tracing vs AI coding observability"],
  updatedAt: "2026-07-19",
  answer:
    "Langfuse helps product and ML teams trace and evaluate LLM applications. UseJunction helps platform and eng leaders see AI coding tool usage across developers’ machines. Different buyers, different telemetry.",
  compareOtherName: "Langfuse",
  compareRows: [
    { feature: "Buyer", usejunction: "Platform / eng leadership", other: "App / ML teams" },
    { feature: "Telemetry", usejunction: "Coding tools, seats, devices", other: "App traces, evals" },
    { feature: "Plan seat waste", usejunction: "Yes", other: "No" },
  ],
  sections: [
    {
      heading: "Can they coexist?",
      body: [
        "Yes. Trace your product’s LLM features with Langfuse; observe your eng team’s coding tools with UseJunction.",
      ],
    },
  ],
  faq: [],
  relatedPaths: ["/compare/helicone", "/guides/see-team-ai-coding-usage"],
};

export const COMPARE_PAGES: ContentPage[] = [
  compareWakatime,
  compareHelicone,
  comparePortkey,
  compareLangfuse,
];
