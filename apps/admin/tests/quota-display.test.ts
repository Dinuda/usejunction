import assert from "node:assert/strict";
import { test } from "vitest";
import {
  aggregateTeamQuotas,
  isSecondaryQuotaWindow,
  quotaRemainingLabel,
  quotaResetLabel,
  quotaSignalLabel,
  quotaWindowLabel,
  teamQuotaSummaryLabel,
} from "../lib/quotas/display";

test("quota window labels distinguish Codex five-hour and weekly limits", () => {
  assert.equal(quotaWindowLabel("session_5h"), "5-hour");
  assert.equal(quotaWindowLabel("weekly"), "Weekly");
  assert.equal(quotaWindowLabel("rate_limit_resets"), "Rate-limit resets");
  assert.equal(quotaWindowLabel("promo_grant"), "Promo grant");
  assert.equal(quotaWindowLabel("copilot_premium_interactions"), "Copilot premium");
});

test("quota reset labels include the exact UTC reset time", () => {
  assert.equal(quotaResetLabel("2026-07-20T14:30:00Z"), "resets Jul 20, 2:30 PM UTC");
  assert.equal(quotaResetLabel("invalid"), null);
  assert.equal(quotaResetLabel(null), null);
});

test("secondary quota windows cover offers grants bonuses and resets", () => {
  assert.equal(isSecondaryQuotaWindow("rate_limit_resets"), true);
  assert.equal(isSecondaryQuotaWindow("promo_grant"), true);
  assert.equal(isSecondaryQuotaWindow("credit_grant"), true);
  assert.equal(isSecondaryQuotaWindow("bonus"), true);
  assert.equal(isSecondaryQuotaWindow("credits"), true);
  assert.equal(isSecondaryQuotaWindow("weekly"), false);
  assert.equal(isSecondaryQuotaWindow("plan"), false);
});

test("quota remaining labels describe inventory without fake percents", () => {
  assert.equal(quotaRemainingLabel(4, "rate_limit_resets"), "4 resets left");
  assert.equal(quotaRemainingLabel(1, "rate_limit_resets"), "1 reset left");
  assert.equal(quotaRemainingLabel(15, "promo_grant"), "$15 left");
  assert.equal(quotaRemainingLabel(200, "copilot_premium_interactions"), "200 left");
  assert.equal(quotaRemainingLabel(null, "credits"), null);
});

test("quota signal label prefers percent then remaining then dash", () => {
  assert.equal(
    quotaSignalLabel({
      windowType: "weekly",
      usedPercent: 63,
      resetsAt: "2026-07-23T07:10:20Z",
    }),
    "63% · resets Jul 23, 7:10 AM UTC",
  );
  assert.equal(
    quotaSignalLabel({
      windowType: "rate_limit_resets",
      remaining: 4,
      resetsAt: "2026-07-25T07:05:10Z",
    }),
    "4 resets left · expires Jul 25, 7:05 AM UTC",
  );
  assert.equal(quotaSignalLabel({ windowType: "plan" }), "—");
});

test("team quota aggregate averages each person's primary window, not every chip", () => {
  const aggregate = aggregateTeamQuotas([
    { windowType: "session_5h", usedPercent: 62, developerName: "Ada" },
    { windowType: "api", usedPercent: 10, developerName: "Ada" },
    { windowType: "auto", usedPercent: 0, developerName: "Ada" },
    { windowType: "weekly", usedPercent: 40, developerName: "Grace" },
    { windowType: "session_5h", usedPercent: 80, developerName: "Grace" },
  ]);

  assert.ok(aggregate);
  // Ada primary is session_5h (62); Grace primary is weekly (40) over session.
  assert.equal(aggregate.avgPercent, 51);
  assert.equal(aggregate.peopleWithSignal, 2);
  assert.equal(aggregate.peopleReporting, 2);
  assert.equal(aggregate.primaryWindowLabel, "Weekly");
  assert.equal(teamQuotaSummaryLabel(aggregate), "avg 51% · Weekly · 2 people");
});

test("team quota aggregate returns null for empty input", () => {
  assert.equal(aggregateTeamQuotas([]), null);
});

test("team quota summary without percent still reports headcount", () => {
  const aggregate = aggregateTeamQuotas([
    { windowType: "session_5h", usedPercent: null, developerName: "Ada" },
  ]);
  assert.ok(aggregate);
  assert.equal(aggregate.avgPercent, null);
  assert.equal(teamQuotaSummaryLabel(aggregate), "1 reporting");
});
