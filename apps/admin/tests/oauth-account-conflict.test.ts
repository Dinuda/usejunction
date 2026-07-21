import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import {
  addOAuthAccountConflictContext,
  isOAuthAccountNotLinkedError,
  isOAuthProviderId,
  safeAuthReturnPath,
} from "@/lib/auth/oauth-account-conflict";

describe("OAuth account conflict handling", () => {
  test("recognizes supported providers and Auth.js account conflicts", () => {
    expect(isOAuthProviderId("google")).toBe(true);
    expect(isOAuthProviderId("unknown")).toBe(false);
    expect(isOAuthAccountNotLinkedError({ type: "OAuthAccountNotLinked" })).toBe(true);
    expect(isOAuthAccountNotLinkedError(new Error("OAuthAccountNotLinked"))).toBe(false);
  });

  test("accepts local return paths and rejects external destinations", () => {
    expect(safeAuthReturnPath("/join/invite-123?step=auth")).toBe(
      "/join/invite-123?step=auth",
    );
    expect(safeAuthReturnPath("https://evil.example/steal")).toBe("/dashboard");
    expect(safeAuthReturnPath("//evil.example/steal")).toBe("/dashboard");
    expect(safeAuthReturnPath("javascript:alert(1)")).toBe("/dashboard");
  });

  test("adds provider and same-origin callback context to the error redirect", () => {
    const request = new NextRequest("https://app.example.com/api/auth/callback/google?code=secret", {
      headers: {
        cookie: "__Secure-authjs.callback-url=https%3A%2F%2Fapp.example.com%2Fjoin%2Finvite-123%3Fstep%3Dauth",
      },
    });
    const response = Response.redirect(
      "https://app.example.com/auth/error?error=OAuthAccountNotLinked",
    );

    const enhancedResponse = addOAuthAccountConflictContext(request, response);

    const location = new URL(enhancedResponse.headers.get("location")!);
    expect(location.searchParams.get("provider")).toBe("google");
    expect(location.searchParams.get("from")).toBe("/join/invite-123?step=auth");
    expect(location.toString()).not.toContain("secret");
  });

  test("does not forward a cross-origin callback URL", () => {
    const request = new NextRequest("https://app.example.com/api/auth/callback/github", {
      headers: { cookie: "__Secure-authjs.callback-url=https%3A%2F%2Fevil.example%2Fsteal" },
    });
    const response = Response.redirect(
      "https://app.example.com/auth/error?error=OAuthAccountNotLinked",
    );

    const enhancedResponse = addOAuthAccountConflictContext(request, response);

    const location = new URL(enhancedResponse.headers.get("location")!);
    expect(location.searchParams.get("provider")).toBe("github");
    expect(location.searchParams.has("from")).toBe(false);
  });

  test("leaves unrelated auth responses unchanged", () => {
    const request = new NextRequest("https://app.example.com/api/auth/callback/google");
    const response = Response.redirect("https://app.example.com/dashboard");

    const enhancedResponse = addOAuthAccountConflictContext(request, response);

    expect(enhancedResponse.headers.get("location")).toBe("https://app.example.com/dashboard");
  });
});
