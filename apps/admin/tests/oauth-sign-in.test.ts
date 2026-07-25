import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOAuthSignInInFlight,
  resetOAuthSignInGuardForTests,
  startOAuthSignIn,
} from "@/lib/auth/oauth-sign-in";

const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

describe("startOAuthSignIn", () => {
  afterEach(() => {
    resetOAuthSignInGuardForTests();
    signIn.mockReset();
  });

  it("ignores a second concurrent sign-in attempt", async () => {
    signIn.mockImplementation(() => new Promise(() => {}));

    const first = startOAuthSignIn("google", "/dashboard");
    expect(isOAuthSignInInFlight()).toBe(true);

    const second = await startOAuthSignIn("google", "/dashboard");
    expect(second).toBe(false);
    expect(signIn).toHaveBeenCalledTimes(1);

    await expect(Promise.race([first, Promise.resolve("pending")])).resolves.toBe("pending");
  });

  it("releases the guard when sign-in returns an error", async () => {
    signIn.mockResolvedValue({ error: "OAuthSignin" });

    const started = await startOAuthSignIn("google", "/dashboard");

    expect(started).toBe(false);
    expect(isOAuthSignInInFlight()).toBe(false);
  });
});
