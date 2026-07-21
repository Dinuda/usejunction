"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { MemberHubNav } from "@/components/developers/member-hub-nav";
import { MemberHubPeriodFilter } from "@/components/developers/member-hub-period";
import { MemberRemoveButton } from "@/components/developers/member-remove-button";
import { MemberRoleSelect } from "@/components/developers/member-role-select";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";
import { useAppQuery } from "@/lib/api/client";
import { canManageSettings, type OrganizationRole } from "@/lib/rbac/permissions";
import type { getDeveloperOverview } from "@/lib/queries/me/overview";
import type { DeveloperRosterData } from "@/lib/read-models/developers";
import type { WorkActivityV1 } from "@/lib/signals/queries/get-work-activity";

export type MemberClientData = {
  section: "overview" | "coding" | "fleet" | "work";
  developerId: string;
  developer: DeveloperRosterData["developers"][number];
  role: OrganizationRole;
  personal: NonNullable<Awaited<ReturnType<typeof getDeveloperOverview>>>;
  selectedPeriodLabel: string;
  work: WorkActivityV1 | null;
  workExtractionEnabled: boolean;
};

const MemberDataContext = createContext<MemberClientData | null>(null);

export function useMemberClientData() {
  const value = useContext(MemberDataContext);
  if (!value) throw new Error("Member page data is unavailable.");
  return value;
}

function sectionFromPath(pathname: string) {
  if (pathname.endsWith("/coding")) return "coding";
  if (pathname.endsWith("/fleet")) return "fleet";
  if (pathname.endsWith("/work")) return "work";
  return "overview";
}

export function MemberClientLayout({ children }: { children: React.ReactNode }) {
  const { developerId } = useParams<{ developerId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = sectionFromPath(pathname);
  const periodQuery = searchParams.toString();
  const apiQuery = new URLSearchParams(periodQuery);
  apiQuery.set("section", section);
  const query = useAppQuery<MemberClientData>(
    ["app", "team", developerId, section, periodQuery],
    `/api/app/team/${encodeURIComponent(developerId)}?${apiQuery.toString()}`,
  );
  if (query.isPending) return <AppPageSkeleton />;
  if (query.error) return <AppPageError error={query.error} retry={() => void query.refetch()} />;
  const { developer, role } = query.data;

  return (
    <MemberDataContext.Provider value={query.data}>
      <PageHeader
        className="mb-8"
        eyebrow={
          <Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink asChild><Link href="/team">Team</Link></BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{developer.name}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
        }
        title={`${developer.name}.`}
        description={`${developer.email} · work, tools, and plan pace.`}
        actions={<MemberHubPeriodFilter className="shrink-0 self-start sm:self-end" />}
      >
        {canManageSettings(role) ? (
          <div className="flex items-center gap-4">
            <MemberRoleSelect developerId={developer.id} role={developer.role} />
            <MemberRemoveButton developerId={developer.id} memberName={developer.name} locked={developer.role === "owner"} />
          </div>
        ) : <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Role: {developer.role}</p>}
        <MemberHubNav developerId={developerId} />
      </PageHeader>
      {children}
    </MemberDataContext.Provider>
  );
}
