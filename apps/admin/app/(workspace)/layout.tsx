import { WorkspaceChrome } from "@/components/app-shell";
import { requireCompletedOnboarding, requireWorkspaceRole } from "@/lib/workspace-context";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();
  await requireWorkspaceRole(["owner", "admin", "developer"]);
  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
