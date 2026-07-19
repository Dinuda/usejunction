import type { ContentPage } from "@/content/types";

export const blogVisibilityBeforeControl: ContentPage = {
  kind: "blog",
  slug: "visibility-before-control",
  path: "/blog/visibility-before-control",
  title: "Visibility Before Control: Operating AI Coding Tools",
  description:
    "Why platform teams should observe AI coding tool usage, cost, and plan utilization before imposing gateways and policy.",
  primaryKeyword: "AI coding observability visibility before control",
  secondaryKeywords: ["engineering control plane AI coding"],
  updatedAt: "2026-07-19",
  answer:
    "AI coding became infrastructure before most orgs owned it. UseJunction’s thesis is visibility before control: see tools, models, cost, plan usage, and device health first, then introduce keys, routing, and policy with evidence.",
  sections: [
    {
      heading: "The problem with control-first",
      body: [
        "Gateways and hard policies fail when you do not know which tools developers already use, which seats are idle, or where personal keys hide.",
        "A shared operating picture reduces anecdotal management (“we think the team uses…”).",
      ],
    },
    {
      heading: "What good visibility looks like",
      body: [
        "Org-wide adoption and coverage.",
        "Spend and performance by person, tool, and model.",
        "Configuration health and plan cycle utilization.",
        "Metadata-only defaults so privacy-conscious teams can adopt.",
      ],
    },
  ],
  faq: [],
  relatedPaths: ["/", "/guides/see-team-ai-coding-usage", "/guides/see-plan-usage-and-waste"],
};

export const blogPlanWaste: ContentPage = {
  kind: "blog",
  slug: "stop-wasting-ai-coding-seats",
  path: "/blog/stop-wasting-ai-coding-seats",
  title: "Stop Wasting AI Coding Seats Before Renewal",
  description:
    "How eng and finance leads can compare purchased Cursor and Claude seats to real utilization and cut waste.",
  primaryKeyword: "wasting Cursor Pro seats",
  secondaryKeywords: ["AI coding seat waste", "subscription cycle utilization"],
  updatedAt: "2026-07-19",
  answer:
    "Seat waste shows up when purchased AI coding seats and quotas do not match verified usage. UseJunction’s cycle utilization views help teams reclaim idle seats and address quota pressure before renewal.",
  sections: [
    {
      heading: "Look beyond a single vendor console",
      body: [
        "Most teams run more than one AI coding product. Waste is a portfolio problem.",
        "Enrollment coverage matters: “zero usage” on an unenrolled device is not the same as an idle paid seat.",
      ],
    },
  ],
  faq: [],
  relatedPaths: ["/guides/see-plan-usage-and-waste", "/for/cursor", "/for/claude-code"],
};

export const BLOG_POSTS: ContentPage[] = [blogVisibilityBeforeControl, blogPlanWaste];
