import { describe, expect, it } from "vitest";
import { assertInsightRoles } from "@/lib/insights/contracts/envelope";
import { rolesFor } from "@/lib/rbac/permissions";

const baseContext = {
  orgId: "org-1",
  actorId: "user-1",
  now: new Date("2026-01-01T00:00:00.000Z"),
  timezone: "UTC",
};

describe("assertInsightRoles org_overview", () => {
  const allowed = rolesFor("org_overview");

  it("allows manager role", () => {
    expect(() =>
      assertInsightRoles({ ...baseContext, roles: ["manager"] }, allowed),
    ).not.toThrow();
  });

  it("allows owner and admin roles", () => {
    expect(() =>
      assertInsightRoles({ ...baseContext, roles: ["owner"] }, allowed),
    ).not.toThrow();
    expect(() =>
      assertInsightRoles({ ...baseContext, roles: ["admin"] }, allowed),
    ).not.toThrow();
  });

  it("rejects developer user role", () => {
    expect(() =>
      assertInsightRoles({ ...baseContext, roles: ["user"] }, allowed),
    ).toThrow("FORBIDDEN");
  });
});
