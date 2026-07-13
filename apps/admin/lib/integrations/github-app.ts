import { createHmac, createSign, timingSafeEqual } from "crypto";
import { fetchJson } from "@/lib/integrations/http";

type GitHubState = { orgId: string; userId: string; returnTo?: string; expiresAt: number };

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function stateSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for GitHub App connections");
  return secret;
}

export function createGitHubState(state: GitHubState) {
  const payload = base64url(JSON.stringify(state));
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGitHubState(value: string): GitHubState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("invalid GitHub connection state");
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("invalid GitHub connection state");
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GitHubState;
  if (!state.orgId || !state.userId || state.expiresAt < Date.now()) throw new Error("expired GitHub connection state");
  if (state.returnTo && !["/onboarding", "/team"].includes(state.returnTo)) throw new Error("invalid GitHub return path");
  return state;
}

export function githubAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !privateKey) throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

function appHeaders() {
  return { Authorization: `Bearer ${githubAppJwt()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
}

export async function getGitHubInstallation(installationId: string) {
  return fetchJson<Record<string, any>>(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}`, { headers: appHeaders() });
}

export async function githubInstallationToken(installationId: string) {
  const response = await fetchJson<{ token: string }>(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: appHeaders(),
  });
  if (!response.token) throw new Error("GitHub App did not return an installation token");
  return response.token;
}
