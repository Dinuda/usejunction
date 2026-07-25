import type { Metadata } from "next";
import { WorkspaceClientLayout } from "@/components/workspace-client-layout";
import { requireCompletedOnboarding } from "@/lib/workspace-context";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();

  return <WorkspaceClientLayout>{children}</WorkspaceClientLayout>;
}
