/**
 * Lemon Squeezy SDK setup (shared so quantity helpers can configure without cycles).
 */
import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

let configured = false;

export function ensureLemonSqueezyConfigured() {
  if (configured) return;
  const apiKey = requireEnv("LEMONSQUEEZY_API_KEY");
  lemonSqueezySetup({ apiKey });
  configured = true;
}

export function requireLemonEnv(name: string): string {
  return requireEnv(name);
}

export function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
