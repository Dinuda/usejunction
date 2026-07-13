import { StatusBadge } from "@/components/app-shell";
import { DeveloperToolInventory } from "@/components/developers/developer-tool-inventory";
import {
  EnrollMachineDialog,
  InvitePeopleDialog,
  TeamConnectPanel,
} from "@/components/team/team-connect-panel";
import { RosterHealth } from "@/components/team/roster-health";
import { getDashboardDevices } from "@/lib/queries/dashboard/devices";
import { requireWorkspaceRole } from "@/lib/workspace-context";

export default async function TeamPage() {
  const { orgId } = await requireWorkspaceRole(["owner", "admin"]);
  const data = await getDashboardDevices(orgId).catch(() => ({
    devices: [] as Awaited<ReturnType<typeof getDashboardDevices>>["devices"],
  }));
  const online = data.devices.filter((device) => device.status === "online").length;
  const gaps = data.devices.filter((device) =>
    device.toolInstallations.some((tool) => tool.detected && !tool.configured),
  ).length;
  const empty = data.devices.length === 0;

  return (
    <>
      <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
            {empty ? "Build your roster." : "Who's on the roster."}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            {empty
              ? "Invite people, enroll a machine, then assign plans to what shows up."
              : "Coverage, seats, and machines reporting into this workspace."}
          </p>
        </div>
        <InvitePeopleDialog />
      </div>

      <RosterHealth online={online} devices={data.devices.length} gaps={gaps} />

      {empty ? (
        <div className="mt-10">
          <div className="uj-grid-texture relative mb-8 overflow-hidden border border-border bg-brand-yellow p-6 text-brand-yellow-dark sm:p-8 [--uj-grid-opacity:0.09]">
            <p className="relative max-w-lg text-2xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-3xl">
              Make model decisions based on evidence.
            </p>
          </div>
          <TeamConnectPanel />
        </div>
      ) : null}

      <section className="mt-10">
        <DeveloperToolInventory showSummary={false} />
      </section>

      {!empty && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Machines.</h2>
              <p className="mt-1 text-xs text-muted-foreground">Reporting into this workspace.</p>
            </div>
            <div className="flex items-center gap-2">
              <EnrollMachineDialog />
            </div>
          </div>
          <ul className="divide-y">
            {data.devices.slice(0, 8).map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{device.hostname}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {device.user?.name ?? device.user?.email ?? "Unassigned"} · {device.os}
                  </p>
                </div>
                <StatusBadge variant={device.status === "online" ? "success" : "default"}>
                  {device.status}
                </StatusBadge>
              </li>
            ))}
          </ul>
          {data.devices.length > 8 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing 8 of {data.devices.length}.
            </p>
          )}
        </section>
      )}
    </>
  );
}
