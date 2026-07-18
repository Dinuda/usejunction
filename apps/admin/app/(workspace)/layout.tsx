import { WorkspaceChrome } from "@/components/app-shell";
import { requireCompletedOnboarding, requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();
  await requireWorkspaceRole(rolesFor("self_view"));
  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
