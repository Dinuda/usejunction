import { SUPPORTED_TOOLS, siteConfig } from "@/lib/public/config";
import {
  USER_LIMIT_FREE,
  TEAM_PRICE_PER_DEV_USD,
  TRIAL_DAYS,
} from "@/lib/saas-billing/entitlements";

/** Short, stable facts for answer engines and llms.txt */
export const AEO_FACTS = {
  oneLiner: `${siteConfig.name} is open-source observability for AI coding tools—usage, cost, plan utilization, and device health.`,
  notATimeTracker:
    "UseJunction is not a WakaTime-style keystroke or hours-in-editor tracker. It focuses on AI coding tool observability.",
  license: "MIT",
  selfHosted: true,
  metadataOnlyDefault: true,
  promptsStoredByDefault: false,
  tools: SUPPORTED_TOOLS.map((tool) => tool.name),
  pricing: {
    community: `Free / self-hosted MIT, up to ${USER_LIMIT_FREE} users`,
    team: `$${TEAM_PRICE_PER_DEV_USD} per active developer / month after a ${TRIAL_DAYS}-day trial`,
    enterprise: "Custom",
  },
  measures: [
    "Which AI coding tools and models developers use",
    "Estimated cost, tokens, latency, and errors by person / tool / model",
    "Subscription cycle and seat utilization signals",
    "Device and agent configuration health",
    "Personal vs company API key signals",
    "Local runtimes such as Ollama and LM Studio",
    "Optional Signals work sessions (metadata; content not stored by default)",
  ],
  doesNotMeasureByDefault: [
    "Prompt and response content",
    "Keystrokes or screenshots",
    "Browser activity capture",
    "Hours-in-editor time tracking à la classic productivity trackers",
  ],
  canonicalHost: "https://usejunction.dev",
  githubUrl: siteConfig.githubUrl,
  contactEmail: "hello@usejunction.dev",
} as const;
