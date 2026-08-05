import type { ContentFaq, ContentPage, ContentSection } from "@/content/types";

function toolPage(opts: {
  slug: string;
  name: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  answer: string;
  extras: string[];
  indexable?: boolean;
  uniqueSections?: ContentSection[];
  uniqueFaq?: ContentFaq[];
}): ContentPage {
  return {
    kind: "for",
    slug: opts.slug,
    path: `/for/${opts.slug}`,
    title: `${opts.name} Usage Analytics for Engineering Teams`,
    description: `Track ${opts.name} usage, cost, and plan utilization across your org with UseJunction—open-source AI coding observability.`,
    primaryKeyword: opts.primaryKeyword,
    secondaryKeywords: opts.secondaryKeywords,
    updatedAt: "2026-07-19",
    indexable: opts.indexable ?? false,
    answer: opts.answer,
    sections: [
      {
        heading: `What UseJunction shows for ${opts.name}`,
        body: [
          `Adoption: which developers and devices actively use ${opts.name}.`,
          "Models, tokens, estimated cost, latency, and failures attributed to people and teams.",
          "Plan and seat context where subscription cycles apply—so utilization is visible before renewal.",
          ...opts.extras,
        ],
      },
      ...(opts.uniqueSections ?? []),
      {
        heading: "How teams roll it out",
        body: [
          "Install UseJunction, enroll devices with the local agent, and keep existing developer workflows.",
          "Privacy first—richer work detail is optional and can be turned off per person or team.",
        ],
      },
    ],
    faq: [
      ...(opts.uniqueFaq ?? []),
      {
        question: `Can I see ${opts.name} cost per developer?`,
        answer: `Yes. UseJunction attributes estimated spend and usage so eng and finance leads can see where ${opts.name} activity concentrates.`,
      },
      {
        question: "Is this self-hosted?",
        answer: "Yes. UseJunction is available under the UseJunction Community License and designed to run on infrastructure you control.",
      },
    ],
    relatedPaths: [
      "/solutions/ai-coding-spend-management",
      "/solutions/ai-coding-seat-utilization",
      "/solutions/ai-coding-plan-usage",
      "/guides/see-plan-usage-and-waste",
      "/guides/see-team-ai-coding-usage",
      "/compare/wakatime",
    ],
  };
}

export const forCursor = toolPage({
  slug: "cursor",
  name: "Cursor",
  primaryKeyword: "Cursor usage analytics for teams",
  secondaryKeywords: ["Cursor plan usage team", "Cursor seat utilization", "Cursor cost per developer", "unused Cursor seats"],
  indexable: false,
  answer:
    "UseJunction tracks Cursor usage across your engineering org: who is active, which models run, estimated cost and latency, and how seats and cycles are utilized—so you can see plan usage and waste with privacy-first controls.",
  extras: ["Personal vs company key signals on enrolled devices.", "Coverage gaps when Cursor is installed but the agent is unhealthy."],
  uniqueSections: [
    {
      heading: "Cursor seat utilization before renewal",
      body: [
        "UseJunction combines Cursor activity, plan-cycle context, and device coverage so teams can distinguish an unused seat from a developer whose device is not reporting.",
        "Review active users, model and token signals, estimated cost, and quota pressure alongside purchased seats instead of exporting separate reports.",
      ],
    },
  ],
  uniqueFaq: [
    {
      question: "Can I see which Cursor seats are idle?",
      answer:
        "Yes. Enrolled-device activity and last-seen coverage help you identify idle or uncovered Cursor seats before renewal.",
    },
  ],
});

export const forAntigravity = toolPage({
  slug: "antigravity",
  name: "Antigravity",
  primaryKeyword: "Antigravity usage tracking for teams",
  secondaryKeywords: ["Google Antigravity plan usage", "Antigravity cost per developer", "Gemini Antigravity team analytics"],
  answer:
    "UseJunction tracks Google Antigravity usage across your engineering org: who is active, which models run, estimated token cost, and Google AI plan pressure—self-hosted with privacy-first Signals work sessions.",
  extras: ["Local conversation DB usage from ~/.gemini plus account/plan signals from the Antigravity app.", "Optional work session titles from trajectory summaries without reading prompts."],
});

export const forClaudeCode = toolPage({
  slug: "claude-code",
  name: "Claude Code",
  primaryKeyword: "Claude Code usage analytics for teams",
  secondaryKeywords: ["Claude Code plan usage", "Claude Code cost per developer", "Claude Code team dashboard"],
  indexable: false,
  answer:
    "UseJunction gives platform teams an org-wide view of Claude Code usage—adoption, models, cost, latency, and plan pressure—self-hosted and open source.",
  extras: ["Combine Claude Code with Cursor and Copilot in one operating picture."],
  uniqueSections: [
    {
      heading: "Claude Code usage without prompt surveillance",
      body: [
        "UseJunction focuses on operational signals such as tool, model, tokens, latency, estimated cost, and status. Teams can keep richer work detail disabled while still measuring adoption and spend.",
        "Compare Claude Code usage with Cursor, Codex, and Copilot so a team can understand tool sprawl and plan pressure across the whole fleet.",
      ],
    },
  ],
  uniqueFaq: [
    {
      question: "Can Claude Code usage be compared with Cursor?",
      answer:
        "Yes. UseJunction puts Claude Code and Cursor signals into the same organization view so teams can compare adoption, cost, latency, and coverage.",
    },
  ],
});

export const forCodex = toolPage({
  slug: "codex",
  name: "Codex",
  primaryKeyword: "Codex usage analytics for teams",
  secondaryKeywords: ["OpenAI Codex team analytics", "Codex cost per developer", "Codex plan usage team"],
  indexable: false,
  answer:
    "UseJunction observes Codex usage on enrolled developer devices so you can attribute activity, cost, and health alongside your other AI coding tools.",
  extras: [],
  uniqueSections: [
    {
      heading: "Codex usage in the context of the AI tool fleet",
      body: [
        "Codex usage is more useful when platform teams can compare it with the other tools developers use. UseJunction attributes available activity and cost signals to people, teams, devices, and models.",
        "Use the same dashboard to find heavy usage, inactive coverage, personal-key drift, and renewal risk across Codex and the rest of the coding-tool fleet.",
      ],
    },
  ],
  uniqueFaq: [
    {
      question: "Is this a personal Codex limit meter?",
      answer:
        "No. UseJunction is designed for organization-level visibility into Codex usage, cost, plan context, and device health rather than a personal menu-bar meter.",
    },
  ],
});

export const forCopilot = toolPage({
  slug: "github-copilot",
  name: "GitHub Copilot",
  primaryKeyword: "GitHub Copilot usage analytics for teams",
  secondaryKeywords: ["Copilot seat utilization", "Copilot cost visibility", "GitHub Copilot seat waste"],
  indexable: false,
  answer:
    "UseJunction helps you see GitHub Copilot in context of the rest of your AI coding stack—usage signals, coverage, and cost attribution next to Cursor and Claude Code.",
  extras: [],
  uniqueSections: [
    {
      heading: "Copilot seats alongside the rest of the stack",
      body: [
        "Copilot is often only one line item in an organization’s AI coding budget. UseJunction gives platform teams a shared view of Copilot adoption, coverage, cost signals, and tool overlap.",
        "Use the same operating picture to compare Copilot with Cursor, Claude Code, Codex, and local runtimes before expanding or reclaiming seats.",
      ],
    },
  ],
  uniqueFaq: [
    {
      question: "Can Copilot seat usage be compared with Cursor?",
      answer:
        "Yes. UseJunction is designed to compare supported AI coding tools across developers and teams, including Copilot and Cursor.",
    },
  ],
});

export const forOllama = toolPage({
  slug: "ollama",
  name: "Ollama",
  primaryKeyword: "Ollama usage across developer laptops",
  secondaryKeywords: ["track local Ollama usage team", "local model observability"],
  answer:
    "UseJunction surfaces which developers run Ollama and related local inference so platform teams can see local-model adoption next to cloud AI coding tools.",
  extras: ["Useful when evaluating local/self-hosted model rollout."],
});

export const forContinue = toolPage({
  slug: "continue",
  name: "Continue",
  primaryKeyword: "Continue usage tracking for teams",
  secondaryKeywords: ["Continue.dev team analytics", "Continue AI assistant usage"],
  answer:
    "UseJunction observes Continue usage on enrolled developer devices so platform teams can attribute activity, cost, and health next to Cursor, Claude Code, and Copilot.",
  extras: [],
});

export const forCline = toolPage({
  slug: "cline",
  name: "Cline",
  primaryKeyword: "Cline usage tracking for teams",
  secondaryKeywords: ["Cline AI coding analytics", "Cline cost visibility"],
  answer:
    "UseJunction gives platform teams visibility into Cline usage across the org—adoption, models, and cost—self-hosted and open source.",
  extras: [],
});

export const forRooCode = toolPage({
  slug: "roo-code",
  name: "Roo Code",
  primaryKeyword: "Roo Code usage tracking for teams",
  secondaryKeywords: ["Roo Code team analytics"],
  answer:
    "UseJunction surfaces Roo Code adoption and cost across enrolled devices so you can see it in the context of your whole AI coding stack.",
  extras: [],
});

export const forOpenCode = toolPage({
  slug: "opencode",
  name: "OpenCode",
  primaryKeyword: "OpenCode usage tracking for teams",
  secondaryKeywords: ["OpenCode team analytics", "OpenCode cost visibility"],
  answer:
    "UseJunction tracks OpenCode usage on developer devices so platform teams can attribute activity and cost alongside their other AI coding tools.",
  extras: [],
});

export const forLmStudio = toolPage({
  slug: "lm-studio",
  name: "LM Studio",
  primaryKeyword: "LM Studio usage across developer laptops",
  secondaryKeywords: ["track LM Studio usage team", "local model observability"],
  answer:
    "UseJunction surfaces which developers run LM Studio and related local inference, so platform teams can see local-model adoption next to cloud AI coding tools.",
  extras: ["Useful when evaluating local/self-hosted model rollout."],
});

export const FOR_PAGES: ContentPage[] = [
  forCursor,
  forAntigravity,
  forClaudeCode,
  forCodex,
  forCopilot,
  forOllama,
  forContinue,
  forCline,
  forRooCode,
  forOpenCode,
  forLmStudio,
];
