import assert from "node:assert/strict";
import { test } from "vitest";
import { displayWorkTitle } from "@/lib/signals/work-display";

test("displayWorkTitle strips bold markdown", () => {
  assert.equal(displayWorkTitle("**AI work extraction**"), "AI work extraction");
});

test("displayWorkTitle converts markdown links to link text", () => {
  assert.equal(
    displayWorkTitle(
      "Deliverables - [Storyboard and frame plan](/Users/me/project/video/storyboard.md) - [Landscape narrative](/Users/me/project/video/narrative.md)",
    ),
    "Deliverables - Storyboard and frame plan - Landscape narrative",
  );
});

test("displayWorkTitle handles truncated markdown links", () => {
  assert.equal(
    displayWorkTitle(
      "Deliverables - [Storyboard and frame plan](/Users/me/project/video/storyboard.md) - [Landscape nar",
    ),
    "Deliverables - Storyboard and frame plan - Landscape nar",
  );
});

test("displayWorkTitle prefers title over tldr", () => {
  assert.equal(displayWorkTitle("Title", "Fallback"), "Title");
});

test("displayWorkTitle falls back to tldr", () => {
  assert.equal(displayWorkTitle(null, "Summary line"), "Summary line");
});
