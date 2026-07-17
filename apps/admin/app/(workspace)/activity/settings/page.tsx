import { redirect } from "next/navigation";
import { requireWorkspaceRole } from "@/lib/workspace-context";

/** Activity settings live on the workspace Settings page. */
export default async function ActivitySettingsRedirectPage() {
  await requireWorkspaceRole(["owner", "admin"]);
  redirect("/settings");
}
