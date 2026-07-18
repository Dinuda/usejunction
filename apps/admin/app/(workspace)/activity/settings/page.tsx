import { redirect } from "next/navigation";
import { requireWorkspaceRole } from "@/lib/workspace-context";
import { rolesFor } from "@/lib/rbac";

/** Activity settings live on the workspace Settings page. */
export default async function ActivitySettingsRedirectPage() {
  await requireWorkspaceRole(rolesFor("settings_billing"));
  redirect("/settings");
}
