import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { getGitHubInstallation, verifyGitHubState } from "@/lib/integrations/github-app";
import { requireOrgRole, audit, rolesFor } from "@/lib/rbac";
import { logServerError } from "@/lib/errors/public";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, rolesFor("settings_billing"));
  if (auth instanceof NextResponse) return auth;
  const installationId = req.nextUrl.searchParams.get("installation_id");
  const stateValue = req.nextUrl.searchParams.get("state");
  if (!installationId || !stateValue) return NextResponse.json({ error: "missing GitHub installation callback values" }, { status: 400 });
  let state;
  try {
    state = verifyGitHubState(stateValue);
  } catch (error) {
    logServerError("integrations/github/callback", error);
    return NextResponse.json({ error: "invalid GitHub connection state" }, { status: 400 });
  }
  if (state.userId !== auth.userId || state.orgId !== auth.orgId) return NextResponse.json({ error: "GitHub connection state does not match the signed-in administrator" }, { status: 403 });
  const installation = await getGitHubInstallation(installationId);
  const installedOrg = String(installation.account?.login ?? "");
  if (!installedOrg || String(installation.account?.type ?? "").toLowerCase() !== "organization") return NextResponse.json({ error: "Install the GitHub App on an organization" }, { status: 422 });
  const config = { product: "copilot", org: installedOrg, installationId } as Prisma.InputJsonValue;
  const connection = await prisma.providerConnection.upsert({
    where: { orgId_provider_product: { orgId: auth.orgId, provider: "github", product: "copilot" } },
    update: { method: "oauth", status: "pending", externalOrgId: installedOrg, credentialCiphertext: null, credentialFingerprint: `app:${installationId.slice(-8)}`, config, permissions: installation.permissions as Prisma.InputJsonValue, nextSyncAt: new Date(), lastError: null },
    create: { orgId: auth.orgId, provider: "github", product: "copilot", method: "oauth", status: "pending", externalOrgId: installedOrg, credentialFingerprint: `app:${installationId.slice(-8)}`, config, permissions: installation.permissions as Prisma.InputJsonValue, nextSyncAt: new Date(), createdByUserId: auth.userId },
    select: { id: true, provider: true, product: true, method: true, status: true, externalOrgId: true, credentialFingerprint: true, permissions: true },
  });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "integration.github_app_installed", targetType: "provider_connection", targetId: connection.id, metadata: { installationId, githubOrg: installedOrg } });
  const destination = state.returnTo ?? "/team";
  return NextResponse.redirect(new URL(`${destination}?connected=github&connection=${connection.id}`, req.nextUrl.origin));
}
