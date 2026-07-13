import { requireCompletedOnboarding, requireWorkspaceRole } from "@/lib/workspace-context";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();
  await requireWorkspaceRole(["owner", "admin", "developer"]);
  return children;
}
