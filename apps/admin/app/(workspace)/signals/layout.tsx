import { rolesFor } from "@/lib/rbac/permissions";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function SignalsLayout({ children }: { children: React.ReactNode }) {
  await requireWorkspaceRole(rolesFor("org_overview"));
  return children;
}
