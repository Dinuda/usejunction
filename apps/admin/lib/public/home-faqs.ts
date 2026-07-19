import {
  TEAM_PRICE_PER_DEV_USD,
  TRIAL_DAYS,
} from "@/lib/saas-billing/entitlements";
import type { ContentFaq } from "@/content/types";

/** Homepage FAQs — answer-first for AEO / AI Overviews */
export const HOME_FAQS: ContentFaq[] = [
  {
    question: "What is UseJunction?",
    answer:
      "UseJunction is open-source observability for AI coding tools. It shows which tools and models your team uses, estimated cost and latency, plan and seat utilization, and device health—self-hosted under MIT, metadata-only by default.",
  },
  {
    question: "How do I see my team’s AI coding plan usage and waste?",
    answer:
      "Enroll developer devices, then open Tools and cycle views to compare purchased seats and quotas against verified usage. Idle seats, quota pressure, and heavy users become visible before renewal—without reading prompts.",
  },
  {
    question: "Is UseJunction an open-source WakaTime alternative?",
    answer:
      "It captures that search intent for AI-era team insights, but it is not a time tracker. UseJunction focuses on AI tool usage, cost, and plan utilization rather than hours-in-editor keystroke tracking. See our WakaTime comparison for an honest breakdown.",
  },
  {
    question: "What data does UseJunction collect?",
    answer:
      "The agent records metadata such as tool, model, tokens, latency, estimated cost, device, and status. Prompts and responses are not stored by default. There is no browser capture or network interception posture.",
  },
  {
    question: "Can we self-host it?",
    answer:
      "Yes. UseJunction is MIT-licensed and designed for infrastructure your team controls. Deploy the admin app with the repository’s Docker or local setup; your metadata stays with you.",
  },
  {
    question: "Which tools are supported?",
    answer:
      "Codex, Claude Code, Cursor, Continue, Cline, Roo Code, OpenCode, GitHub Copilot, Ollama, LM Studio, and related local runtimes—with more on the roadmap.",
  },
  {
    question: "Is Team available today?",
    answer: `Yes. New organizations start on a ${TRIAL_DAYS}-day trial, then can upgrade to Team at $${TEAM_PRICE_PER_DEV_USD} per active developer per month for full observability.`,
  },
];
