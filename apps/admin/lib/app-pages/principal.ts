import { redirect } from "next/navigation";
import type { AppPrincipal } from "@/lib/api/app-auth";
import type { OrganizationRole } from "@/lib/rbac/permissions";
import { requireCompletedOnboarding, requireWorkspaceRole } from "@/lib/workspace-context";

/**
 * Build an AppPrincipal from the server workspace context (RSC loaders).
 * Pass `allowed` to restrict roles (redirects via requireWorkspaceRole).
 */
export async function principalFromWorkspace(
  allowed?: readonly OrganizationRole[],
): Promise<AppPrincipal> {
  const ctx = allowed
    ? await requireWorkspaceRole(allowed)
    : await requireCompletedOnboarding();
  if (!ctx.role) redirect("/onboarding");
  return {
    userId: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    image: ctx.image,
    orgId: ctx.orgId,
    role: ctx.role,
  };
}
