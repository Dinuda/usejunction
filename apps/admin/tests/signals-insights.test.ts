import { test } from "vitest";
import assert from "node:assert/strict";
import { changePercent, median, sharePercent, startOfUtcWeek } from "../lib/signals/policies/aggregates";
import {
  encodeFlowKey,
  parseFlowKey,
  displayFlow,
  flowKeyFromSession,
} from "../lib/signals/policies/flow";
import { buildRecommendedAction, buildSignalsInsight } from "../lib/signals/policies/insight";

test("median returns middle value for odd lengths", () => {
  assert.equal(median([3, 1, 2]), 2);
});

test("median averages middle pair for even lengths", () => {
  assert.equal(median([4, 1, 2, 3]), 3);
});

test("changePercent has no growth rate without a prior baseline", () => {
  assert.equal(changePercent(10, 0), null);
  assert.equal(changePercent(0, 0), null);
  assert.equal(changePercent(12, 10), 20);
  assert.equal(changePercent(8, 10), -20);
});

test("sharePercent rounds part of whole", () => {
  assert.equal(sharePercent(1, 4), 25);
  assert.equal(sharePercent(0, 0), 0);
});

test("flow key round-trips", () => {
  const key = encodeFlowKey({ before: "GitHub", aiTool: "Cursor", after: "Slack" });
  const parsed = parseFlowKey(key);
  assert.ok(parsed);
  assert.equal(parsed!.before, "github");
  assert.equal(parsed!.aiTool, "cursor");
  assert.equal(parsed!.after, "slack");
  assert.equal(displayFlow(parsed!), "github -> cursor -> slack");
});

test("flowKeyFromSession prefers domain over app", () => {
  const key = flowKeyFromSession({
    domainBefore: "github.com",
    appBefore: "Google Chrome",
    aiTool: "ChatGPT",
    domainAfter: null,
    appAfter: "Slack",
  });
  assert.equal(key, encodeFlowKey({ before: "github.com", aiTool: "ChatGPT", after: "Slack" }));
});

test("buildSignalsInsight never claims +100% without a prior baseline", () => {
  const firstWeek = buildSignalsInsight({
    policyEnabled: true,
    sessions: 163,
    priorSessions: 0,
    sessionsChangePercent: null,
    topTools: [
      { tool: "cursor", sessions: 89, sharePercent: 55 },
      { tool: "chatgpt", sessions: 74, sharePercent: 45 },
    ],
    topJourney: {
      flow: "Google Chrome -> cursor -> Google Chrome",
      sessions: 54,
      people: 1,
    },
  });
  assert.doesNotMatch(firstWeek, /100%/);
  assert.doesNotMatch(firstWeek, /increased/);
  assert.match(firstWeek, /browser/i);
  assert.match(firstWeek, /Cursor/);
});

test("buildSignalsInsight treats dominant browser loops as conversation starters", () => {
  const insight = buildSignalsInsight({
    policyEnabled: true,
    sessions: 100,
    priorSessions: 80,
    sessionsChangePercent: 25,
    topTools: [{ tool: "cursor", sessions: 60, sharePercent: 60 }],
    topJourney: {
      flow: "Google Chrome -> cursor -> Google Chrome",
      sessions: 40,
      people: 4,
    },
  });
  assert.match(insight, /integration|template|ask/i);
  assert.doesNotMatch(insight, /wasting|caught|productivity/i);
});

test("buildSignalsInsight covers off / empty cases", () => {
  assert.match(
    buildSignalsInsight({
      policyEnabled: false,
      sessions: 0,
      priorSessions: 0,
      sessionsChangePercent: null,
      topTools: [],
      topJourney: null,
    }),
    /Collection is off/i,
  );
  assert.match(
    buildSignalsInsight({
      policyEnabled: true,
      sessions: 0,
      priorSessions: 0,
      sessionsChangePercent: null,
      topTools: [],
      topJourney: null,
    }),
    /No journeys yet/i,
  );
});

test("buildRecommendedAction prefers settings when disabled", () => {
  assert.deepEqual(
    buildRecommendedAction({
      policyEnabled: false,
      topTool: null,
      topJourneyFlowKey: null,
      sessions: 0,
      journeySharePercent: 0,
    }),
    { label: "Open Boundaries", href: "/signals/settings" },
  );
});

test("buildRecommendedAction opens the dominant journey", () => {
  const action = buildRecommendedAction({
    policyEnabled: true,
    topTool: "cursor",
    topJourneyFlowKey: "chrome__cursor__chrome",
    sessions: 40,
    journeySharePercent: 33,
  });
  assert.equal(action?.label, "Open this journey");
  assert.equal(action?.href, "/signals/journeys/chrome__cursor__chrome");
});

test("buildRecommendedAction is quiet when enabled with no sessions", () => {
  assert.equal(
    buildRecommendedAction({
      policyEnabled: true,
      topTool: null,
      topJourneyFlowKey: null,
      sessions: 0,
      journeySharePercent: 0,
    }),
    null,
  );
});

test("startOfUtcWeek is Monday-based", () => {
  // 2026-07-16 is Thursday
  assert.equal(startOfUtcWeek(new Date("2026-07-16T12:00:00.000Z")), "2026-07-13");
});
