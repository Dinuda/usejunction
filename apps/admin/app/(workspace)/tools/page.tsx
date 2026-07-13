import { SubscriptionInventory } from "@/components/tools/subscription-inventory";
import { getDashboardTools } from "@/lib/queries/dashboard/tools";
import { getMeOverview } from "@/lib/queries/me/overview";
import { requireWorkspaceRole } from "@/lib/workspace-context";

function ToolsHeader({ personal = false }: { personal?: boolean }) {
  return (
    <div className="mb-10">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
        {personal ? "Your tools, in one place." : "Tools, seats, spend."}
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {personal
          ? "Tools detected on your connected computers and plans assigned to you."
          : "Manage team subscriptions and compare purchased seats with detected activity."}
      </p>
    </div>
  );
}

export default async function ToolsPage() {
  const { orgId, role, userId } = await requireWorkspaceRole(["owner", "admin", "developer"]);
  if (role === "developer") {
    const personal = await getMeOverview(orgId, userId, role);
    return (
      <>
        <ToolsHeader personal />
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="border-l-2 border-primary/40 pl-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Detected tools</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{personal.developer.reportedTools.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">Reported by your devices</p>
          </div>
          <div className="border-l-2 border-brand-yellow-dark bg-brand-yellow-pale py-3 pr-4 pl-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Assigned plans</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{personal.developer.assignedPlans.length}</p>
            <p className="mt-2 text-xs text-muted-foreground">Available to you</p>
          </div>
        </div>
        <section className="mt-10">
          <div className="mb-4 pb-3">
            <h2 className="text-lg font-semibold tracking-tight">Your tools.</h2>
          </div>
          <div className="divide-y">
            {personal.developer.reportedTools.length ? personal.developer.reportedTools.map((tool) => (
              <div key={`${tool.toolName}-${tool.source}`} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-sm font-medium">{tool.toolName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Detected by {tool.source}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{new Date(tool.observedAt).toLocaleDateString()}</span>
              </div>
            )) : <p className="py-4 text-sm text-muted-foreground">Connect a computer to detect your tools.</p>}
          </div>
        </section>
      </>
    );
  }
  let data: Awaited<ReturnType<typeof getDashboardTools>> | null = null;
  let err: string | null = null;

  try {
    data = await getDashboardTools(orgId);
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load tools";
  }

  return (
    <>
      <ToolsHeader />

      {err && (
        <div className="mb-6 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <SubscriptionInventory detected={data} />
    </>
  );
}
