import type { Metadata } from "next";
import { WorkspaceChrome } from "@/components/app-shell";
import { requireCompletedOnboarding, requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();
  await requireWorkspaceRole(rolesFor("self_view"));
  return <WorkspaceChrome>{children}</WorkspaceChrome>;
}
