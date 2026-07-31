import type { Metadata } from "next";
import { WorkspaceClientLayout } from "@/components/workspace-client-layout";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceClientLayout>{children}</WorkspaceClientLayout>;
}
