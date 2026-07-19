import { getOrgBillingStatus } from "@/lib/saas-billing/status";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";

export async function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  const ctx = await getWorkspaceContext();
  const billing = ctx?.orgId ? await getOrgBillingStatus(ctx.orgId, ctx.role) : null;

  return (
    <WorkspaceShell
      organizations={ctx?.organizations ?? []}
      currentOrgId={ctx?.orgId ?? null}
      role={ctx?.role ?? null}
      name={ctx?.name}
      email={ctx?.email}
      image={ctx?.image}
      billing={billing}
    >
      {children}
    </WorkspaceShell>
  );
}
