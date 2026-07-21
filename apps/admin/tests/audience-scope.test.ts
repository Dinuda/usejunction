import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  audienceScopeHref,
  copyAudienceScope,
  parseAudienceScope,
} from "@/lib/audience-scope";

describe("parseAudienceScope", () => {
  it("defaults to team", () => {
    assert.equal(parseAudienceScope(null), "team");
    assert.equal(parseAudienceScope(undefined), "team");
    assert.equal(parseAudienceScope(""), "team");
    assert.equal(parseAudienceScope("team"), "team");
    assert.equal(parseAudienceScope("other"), "team");
  });

  it("accepts you", () => {
    assert.equal(parseAudienceScope("you"), "you");
  });
});

describe("audienceScopeHref", () => {
  it("omits scope for team default", () => {
    assert.equal(audienceScopeHref("/dashboard", "team", "view=current_cycles"), "/dashboard?view=current_cycles");
  });

  it("sets scope=you and drops developerId", () => {
    assert.equal(
      audienceScopeHref("/signals/activity", "you", "days=14&developerId=dev-1&tool=cursor"),
      "/signals/activity?days=14&tool=cursor&scope=you",
    );
  });

  it("preserves other params when switching to you", () => {
    assert.equal(
      audienceScopeHref("/activity", "you", "view=last_30_days&days=7"),
      "/activity?view=last_30_days&days=7&scope=you",
    );
  });
});

describe("copyAudienceScope", () => {
  it("copies you or team into params", () => {
    const params = new URLSearchParams({ view: "current_cycles" });
    copyAudienceScope(params, "scope=you&days=7");
    assert.equal(params.get("scope"), "you");
    assert.equal(params.get("view"), "current_cycles");
  });
});
