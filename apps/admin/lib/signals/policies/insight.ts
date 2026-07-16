import type { SignalsRecommendedAction, SignalsToolRow } from "@/lib/signals/contracts/shared";
import { toolDisplayName } from "@/lib/tools/catalog";

function prettyFlow(flow: string) {
  return flow.replace(/ -> /g, " → ");
}

function splitFlow(flow: string) {
  return flow
    .split(/\s*(?:->|→)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function looksLikeBrowser(label: string) {
  const lower = label.toLowerCase();
  return (
    lower.includes("chrome") ||
    lower.includes("safari") ||
    lower.includes("firefox") ||
    lower.includes("edge") ||
    lower.includes("brave") ||
    lower === "browser"
  );
}

/** Empathetic operating insight for founders/admins — patterns to discuss, not vanity %. */
export function buildSignalsInsight(input: {
  policyEnabled: boolean;
  sessions: number;
  priorSessions: number;
  sessionsChangePercent: number | null;
  topTools: Array<Pick<SignalsToolRow, "tool" | "sessions" | "sharePercent">>;
  topJourney: { flow: string; sessions: number; people: number } | null;
}): string {
  if (!input.policyEnabled) {
    return "Collection is off. When you are ready, turn Signals on so the team can see how AI sits in real work — without reading anyone’s content.";
  }
  if (input.sessions <= 0) {
    return "No journeys yet in this window. Once enrolled agents upload a few sessions, we will surface the patterns that are worth a conversation.";
  }

  const journey = input.topJourney;
  const journeyShare =
    journey && input.sessions > 0 ? Math.round((journey.sessions / input.sessions) * 100) : 0;
  const leadTool = input.topTools[0];
  const secondTool = input.topTools[1];
  const leadName = leadTool ? toolDisplayName(leadTool.tool) : null;
  const secondName = secondTool ? toolDisplayName(secondTool.tool) : null;

  // First week / no prior baseline — never claim "+100%"
  if (input.priorSessions <= 0) {
    if (journey && journeyShare >= 20) {
      const parts = splitFlow(journey.flow);
      if (parts.length >= 3 && looksLikeBrowser(parts[0]!) && looksLikeBrowser(parts[2]!)) {
        return `${journey.sessions} of ${input.sessions} sessions bounce through the browser into ${toolDisplayName(parts[1]!)} and back. That often means people are carrying context by hand — a gentle question for the team: what feels hardest to bring into ${toolDisplayName(parts[1]!)}?`;
      }
      return `The pattern showing up most is ${prettyFlow(journey.flow)} (${journey.sessions} sessions). That is a place to start a conversation about friction — not a judgment of anyone’s work.`;
    }
    if (leadName && leadTool && leadTool.sharePercent >= 50) {
      return `${leadName} is where most AI-adjacent time is landing (${leadTool.sharePercent}% of sessions). Use that as a quiet check on whether seats and enablement match how people actually work.`;
    }
    return `We are seeing the first ${input.sessions} AI-adjacent sessions come in. Patterns will get clearer as more of the team’s week is represented — no need to act on early noise.`;
  }

  // Repeated journey that dominates — the distinctive Signals value
  if (journey && journeyShare >= 25) {
    const parts = splitFlow(journey.flow);
    if (parts.length >= 3 && looksLikeBrowser(parts[0]!) && looksLikeBrowser(parts[2]!)) {
      return `${journeyShare}% of sessions follow the same loop: browser → ${toolDisplayName(parts[1]!)} → browser. That is usually manual context-moving. Ask the people doing it whether an integration or template would save them time.`;
    }
    if (parts.length >= 3 && parts[0]!.toLowerCase() === parts[2]!.toLowerCase()) {
      return `People keep returning to ${parts[0]} after ${toolDisplayName(parts[1]!)} (${journey.sessions} times). Worth asking if that round-trip is intentional — or a sign something is missing between those tools.`;
    }
    return `The strongest repeated shape is ${prettyFlow(journey.flow)} — ${journey.sessions} sessions across ${journey.people} ${journey.people === 1 ? "person" : "people"}. Treat it as a workflow clue, not a score.`;
  }

  // Tool concentration — finance / enablement angle
  if (leadName && leadTool && leadTool.sharePercent >= 60) {
    const other =
      secondName && secondTool
        ? ` ${secondName} still shows up (${secondTool.sharePercent}%), so confirm both seats are intentional.`
        : "";
    return `${leadName} carries most AI-adjacent work right now (${leadTool.sharePercent}% of sessions).${other}`;
  }

  if (leadName && secondName && leadTool && secondTool && leadTool.sharePercent + secondTool.sharePercent >= 70) {
    return `${leadName} and ${secondName} together account for most AI-adjacent sessions. A useful ops check: do people know when to use which, or are they bouncing between both for the same jobs?`;
  }

  // Meaningful change only when we have a real baseline
  if (input.sessionsChangePercent != null && Math.abs(input.sessionsChangePercent) >= 20) {
    const direction = input.sessionsChangePercent > 0 ? "up" : "down";
    const mag = Math.abs(input.sessionsChangePercent);
    const toolBit = leadName ? ` ${leadName} is still the main place it shows up.` : "";
    return `AI-adjacent sessions are ${direction} about ${mag}% versus the prior period.${toolBit} Look at the journeys below before drawing conclusions — volume alone is not adoption quality.`;
  }

  if (journey) {
    return `Work around AI looks steady. The journey that keeps repeating is ${prettyFlow(journey.flow)} — a grounded place to ask the team what is working.`;
  }

  return `AI-adjacent activity looks steady this period. When a journey starts to dominate, we will call it out so you can ask the people doing the work — not guess from anecdotes.`;
}

export function buildRecommendedAction(input: {
  policyEnabled: boolean;
  topTool: string | null;
  topJourneyFlowKey: string | null;
  sessions: number;
  journeySharePercent: number;
}): SignalsRecommendedAction | null {
  if (!input.policyEnabled) {
    return { label: "Open Boundaries", href: "/signals/settings" };
  }
  if (input.sessions <= 0) {
    return null;
  }
  if (input.topJourneyFlowKey && input.journeySharePercent >= 20) {
    return {
      label: "Open this journey",
      href: `/signals/journeys/${encodeURIComponent(input.topJourneyFlowKey)}`,
    };
  }
  if (input.topTool) {
    return {
      label: `See ${toolDisplayName(input.topTool)} journeys`,
      href: `/signals/journeys?tool=${encodeURIComponent(input.topTool)}`,
    };
  }
  return { label: "Browse journeys", href: "/signals/journeys" };
}
