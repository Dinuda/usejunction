import type { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import type { OrganizationRole } from "@/lib/rbac";
import { ORGANIZATION_ROLES } from "@/lib/rbac/permissions";
import { appError } from "@/lib/api/app-response";

export type AppPrincipal = {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  orgId: string;
  role: OrganizationRole;
};

function isOrganizationRole(value: string | null | undefined): value is OrganizationRole {
  return Boolean(value && (ORGANIZATION_ROLES as readonly string[]).includes(value));
}

/**
 * Resolve the active workspace principal from Auth.js JWT claims only.
 * Membership is verified at sign-in and workspace switch (`update`), not on
 * every page-data request — matching Auth.js JWT session strategy.
 */
export async function requireAppPrincipal(
  _request: NextRequest,
  allowed: readonly OrganizationRole[] = ["owner", "admin", "manager", "user"],
): Promise<AppPrincipal | NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return appError("UNAUTHENTICATED", "Your session has expired.", 401);
  }

  const orgId = session.user.orgId;
  const role = session.user.role;
  if (!orgId || !isOrganizationRole(role)) {
    return appError("WORKSPACE_REQUIRED", "Workspace setup is required.", 409);
  }
  if (!allowed.includes(role)) {
    return appError("FORBIDDEN", "You do not have access to this resource.", 403);
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    orgId,
    role,
  };
}
