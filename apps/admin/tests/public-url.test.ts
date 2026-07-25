import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { getPublicAppUrl } from "../lib/public-url";

const ORIGINAL = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  USEJUNCTION_USE_CONFIGURED_APP_URL: process.env.USEJUNCTION_USE_CONFIGURED_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("getPublicAppUrl prefers loopback request origin over configured production URL", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://usejunction.dev";
  delete process.env.USEJUNCTION_USE_CONFIGURED_APP_URL;

  assert.equal(
    getPublicAppUrl(new Request("http://localhost:3001/api/me/enrollment-token")),
    "http://localhost:3001",
  );
  assert.equal(
    getPublicAppUrl(new Request("http://127.0.0.1:3001/onboarding")),
    "http://127.0.0.1:3001",
  );
});

test("getPublicAppUrl keeps configured URL when request is not loopback", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://usejunction.dev";
  delete process.env.USEJUNCTION_USE_CONFIGURED_APP_URL;

  assert.equal(
    getPublicAppUrl(new Request("https://usejunction.dev/api/me/enrollment-token")),
    "https://usejunction.dev",
  );
});

test("USEJUNCTION_USE_CONFIGURED_APP_URL forces configured URL on localhost", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://usejunction.dev";
  process.env.USEJUNCTION_USE_CONFIGURED_APP_URL = "true";

  assert.equal(
    getPublicAppUrl(new Request("http://localhost:3001/api/me/enrollment-token")),
    "https://usejunction.dev",
  );
});

test("getPublicAppUrl without request uses configured env (or localhost default)", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://usejunction.dev";
  assert.equal(getPublicAppUrl(), "https://usejunction.dev");

  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXTAUTH_URL;
  assert.equal(getPublicAppUrl(), "http://localhost:3001");
});
