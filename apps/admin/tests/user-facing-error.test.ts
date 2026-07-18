import { describe, expect, it } from "vitest";
import { userFacingError } from "@/lib/errors/user-facing";

describe("userFacingError", () => {
  it("keeps intentional API messages", () => {
    expect(userFacingError("Could not update workspace.", "fallback")).toBe("Could not update workspace.");
  });

  it("hides raw HTTP dumps", () => {
    expect(
      userFacingError(
        `usage: POST /api/ingest/local-usage returned 413: {"error":"maximum 1000 aggregates per request"}`,
        "Local sync failed.",
      ),
    ).toBe("Local sync failed.");
  });

  it("falls back when empty", () => {
    expect(userFacingError(null, "fallback")).toBe("fallback");
    expect(userFacingError("  ", "fallback")).toBe("fallback");
  });
});
