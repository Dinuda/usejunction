import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGitHubState } from "@/lib/integrations/github-app";
import { requireOrgRole } from "@/lib/rbac";

const query = z.object({
  returnTo: z.enum(["/onboarding", "/team"]).default("/team"),
});

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = query.safeParse({ returnTo: req.nextUrl.searchParams.get("returnTo") ?? "/team" });
  if (!parsed.success) return NextResponse.json({ error: "invalid GitHub return path" }, { status: 400 });
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return NextResponse.json({ error: "GITHUB_APP_SLUG is not configured" }, { status: 503 });
  const state = createGitHubState({ orgId: auth.orgId, userId: auth.userId, returnTo: parsed.data.returnTo, expiresAt: Date.now() + 10 * 60_000 });
  return NextResponse.redirect(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`);
}
