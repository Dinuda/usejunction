import type { ContentPage } from "@/content/types";

const dashboardImage = {
  src: "/blog/what-is-ai-coding-observability/usejunction-dashboard.webp",
  alt: "UseJunction dashboard showing AI coding tool usage and spend signals",
  width: 1400,
  height: 842,
  caption: "A shared view of AI coding usage, spend, and operational signals.",
};

export const solutionAiCodingSpend: ContentPage = {
  kind: "solution",
  slug: "ai-coding-spend-management",
  path: "/solutions/ai-coding-spend-management",
  title: "AI Coding Spend Management for Engineering Teams",
  description:
    "Track AI coding cost per developer, model, and tool across your engineering team. UseJunction makes Cursor, Claude Code, Codex, and Copilot spend visible before renewal.",
  primaryKeyword: "AI coding spend management",
  secondaryKeywords: [
    "AI coding cost tracking",
    "AI tool cost per developer",
    "AI coding budget management",
    "engineering AI spend dashboard",
  ],
  updatedAt: "2026-08-04",
  answer:
    "UseJunction is AI coding spend management for engineering teams. It combines usage signals from Cursor, Claude Code, Codex, Copilot, and local runtimes so platform and finance leads can see cost by developer, tool, and model, understand plan utilization, and act on waste before the next renewal.",
  images: [dashboardImage],
  sections: [
    {
      heading: "See where the AI coding budget goes",
      body: [
        "AI coding invoices tell you what the organization paid. UseJunction adds the operating context: which developers use each tool, which models drive estimated cost, and where usage is concentrated.",
        "Compare verified vendor usage with estimated local usage so finance and engineering can discuss the same evidence instead of reconciling separate dashboards.",
      ],
    },
    {
      heading: "One spend view across the tool fleet",
      body: [
        "Track Cursor, Claude Code, Codex, GitHub Copilot, Continue, Cline, Roo Code, OpenCode, Ollama, LM Studio, and related local runtimes in one organization-level view.",
        "Use tool, model, developer, team, latency, and failure breakdowns to find expensive models, inactive seats, and configuration gaps.",
      ],
    },
    {
      heading: "Built for privacy-conscious teams",
      body: [
        "The local agent reports operational usage signals without keystroke surveillance, browser capture, or full network interception. Richer Signals work detail is optional and can be turned off.",
        "Self-host the control plane under the UseJunction Community License when your organization needs data on infrastructure it controls.",
      ],
    },
    {
      heading: "What UseJunction does not claim",
      body: [
        "UseJunction estimates coding-tool usage and cost; it is not an invoice replacement or an accounting system. Vendor-reported charges remain the source of truth when available.",
        "It is also not a classic hours-in-editor tracker. UseJunction is designed for AI tool fleet visibility, cost attribution, and plan intentionality.",
      ],
    },
  ],
  faq: [
    {
      question: "Can I see AI coding cost per developer?",
      answer:
        "Yes. UseJunction attributes available usage and estimated spend by developer, team, tool, and model so engineering and finance can see where the budget is concentrated.",
    },
    {
      question: "Does UseJunction replace vendor billing?",
      answer:
        "No. Vendor billing remains authoritative for charges. UseJunction adds cross-tool usage, plan, device, and attribution context that vendor billing pages usually do not provide.",
    },
    {
      question: "Can we self-host AI spend data?",
      answer:
        "Yes. UseJunction is designed to run on infrastructure your team controls under the UseJunction Community License.",
    },
  ],
  relatedPaths: [
    "/solutions/ai-coding-seat-utilization",
    "/solutions/ai-coding-plan-usage",
    "/guides/see-team-ai-coding-usage",
    "/guides/personal-vs-company-api-keys",
    "/for/cursor",
  ],
};

export const solutionSeatUtilization: ContentPage = {
  kind: "solution",
  slug: "ai-coding-seat-utilization",
  path: "/solutions/ai-coding-seat-utilization",
  title: "AI Coding Seat Utilization and Seat Waste",
  description:
    "Find inactive AI coding seats, quota pressure, and coverage gaps across Cursor, Claude Code, Codex, and Copilot before your next renewal.",
  primaryKeyword: "AI coding seat utilization",
  secondaryKeywords: [
    "AI tool seat waste",
    "Cursor seat utilization",
    "unused AI coding seats",
    "AI coding subscription waste",
  ],
  updatedAt: "2026-08-04",
  answer:
    "UseJunction helps engineering and finance teams measure AI coding seat utilization before renewal. Compare purchased seats and plan quotas with enrolled-device activity, identify idle or uncovered seats, and separate true inactivity from missing telemetry.",
  images: [dashboardImage],
  sections: [
    {
      heading: "Know which seats are actually being used",
      body: [
        "A paid seat with no activity can mean an idle subscription, a developer using a different tool, or a device that is not reporting. UseJunction keeps those cases visible instead of collapsing them into one number.",
        "Review active usage, last-seen coverage, plan cycles, and tool adoption together before reclaiming or expanding seats.",
      ],
    },
    {
      heading: "Measure utilization across vendors",
      body: [
        "Cursor, Claude Code, Codex, and Copilot each expose different usage surfaces. UseJunction gives platform teams one comparison layer across the AI coding fleet.",
        "See quota pressure and heavy users alongside idle seats so renewal decisions reflect both waste and capacity risk.",
      ],
    },
    {
      heading: "Turn seat waste into an operating workflow",
      body: [
        "Start with visibility, validate the signal with the team owner, and then reclaim, reassign, or change the plan. UseJunction is designed to support that workflow without forcing policy or traffic interception.",
        "Coverage and device-health signals help you avoid penalizing a developer simply because an agent is unhealthy or not enrolled.",
      ],
    },
  ],
  faq: [
    {
      question: "How do I find unused Cursor seats?",
      answer:
        "Enroll the relevant devices and compare Cursor activity, last-seen coverage, and purchased seat or cycle context. UseJunction surfaces inactive and uncovered cases before renewal.",
    },
    {
      question: "Can seat utilization include Claude Code and Codex?",
      answer:
        "Yes. UseJunction is built to compare multiple AI coding tools in one organization view, including Claude Code and Codex alongside Cursor and Copilot.",
    },
    {
      question: "Does seat utilization mean employee productivity tracking?",
      answer:
        "No. The focus is tool adoption, plan usage, cost, device coverage, and health. There is no keystroke surveillance or browser capture by design.",
    },
  ],
  relatedPaths: [
    "/solutions/ai-coding-spend-management",
    "/solutions/ai-coding-plan-usage",
    "/guides/see-plan-usage-and-waste",
    "/for/cursor",
    "/compare/engineering-intelligence",
  ],
};

export const solutionPlanUsage: ContentPage = {
  kind: "solution",
  slug: "ai-coding-plan-usage",
  path: "/solutions/ai-coding-plan-usage",
  title: "AI Coding Plan Usage for Teams",
  description:
    "See Cursor, Claude Code, Codex, and Copilot plan usage across your team—quotas, cycles, heavy users, idle seats, and renewal risk in one view.",
  primaryKeyword: "AI coding plan usage",
  secondaryKeywords: [
    "Cursor plan usage for teams",
    "Claude Code plan usage",
    "Codex usage for teams",
    "AI coding quota monitoring",
  ],
  updatedAt: "2026-08-04",
  answer:
    "UseJunction gives engineering teams a shared view of AI coding plan usage across vendors. Connect enrolled devices, compare subscription cycles and quotas with observed activity, and understand who is near limits, who is idle, and where the organization needs better coverage.",
  images: [dashboardImage],
  sections: [
    {
      heading: "Plan usage is more than a vendor dashboard",
      body: [
        "Vendor admin pages are usually organized around one product. Engineering teams often run several AI coding subscriptions at once, which makes quota pressure and renewal decisions difficult to compare.",
        "UseJunction brings tool, model, developer, plan, and device context into the same operating picture.",
      ],
    },
    {
      heading: "See quota pressure before it becomes an incident",
      body: [
        "Identify developers and teams approaching plan limits, then compare that pressure with tool choice, model usage, and cycle timing.",
        "This makes it easier to distinguish a temporary spike from a plan that no longer fits the team’s workload.",
      ],
    },
    {
      heading: "Connect usage to rollout decisions",
      body: [
        "Use plan signals to decide whether to expand a subscription, reclaim an idle seat, standardize a tool, or investigate a missing device enrollment.",
        "Keep richer work detail optional so teams can improve visibility without turning plan measurement into developer surveillance.",
      ],
    },
  ],
  faq: [
    {
      question: "Can I see Cursor plan usage for my whole team?",
      answer:
        "Yes. UseJunction rolls up Cursor-related activity, plan cycles, quota pressure, and enrollment coverage across the organization.",
    },
    {
      question: "Can this show Claude Code and Codex usage too?",
      answer:
        "Yes. UseJunction combines supported AI coding tools in one dashboard so teams can compare usage patterns instead of checking one vendor at a time.",
    },
    {
      question: "What happens when a vendor does not expose a plan metric?",
      answer:
        "UseJunction shows the usage and coverage signals available from the local agent or connected integration and keeps their provenance visible. It does not invent a vendor-confirmed quota.",
    },
  ],
  howTo: {
    name: "Review AI coding plan usage",
    description: "A practical rollout for measuring plans and quotas across an engineering team.",
    steps: [
      { name: "Enroll devices", text: "Connect the developers and teams whose AI coding usage you want to compare." },
      { name: "Review tool coverage", text: "Check which tools and models are active and which devices are missing or unhealthy." },
      { name: "Compare cycles", text: "Review quotas, subscription cycles, observed usage, and heavy-user concentration." },
      { name: "Plan the next action", text: "Reclaim idle seats, adjust plans, or investigate coverage before renewal." },
    ],
  },
  relatedPaths: [
    "/solutions/ai-coding-spend-management",
    "/solutions/ai-coding-seat-utilization",
    "/guides/see-plan-usage-and-waste",
    "/for/claude-code",
    "/for/codex",
  ],
};

export const SOLUTIONS: ContentPage[] = [
  solutionAiCodingSpend,
  solutionSeatUtilization,
  solutionPlanUsage,
];
