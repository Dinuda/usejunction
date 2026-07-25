"use client";

import Link from "next/link";
import { createContext, useContext, useMemo } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { MemberHubNav } from "@/components/developers/member-hub-nav";
import { MemberHubPeriodFilter } from "@/components/developers/member-hub-period";
import { MemberRemoveButton } from "@/components/developers/member-remove-button";
import { MemberRoleSelect } from "@/components/developers/member-role-select";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { AppPageError, AppPageSkeleton } from "@/components/app-data-state";
import { useAppPageQuery } from "@/lib/api/client";
import { teamMemberHubKey, teamMemberWorkKey } from "@/lib/app-pages/query-keys";
import type { TeamMemberHubPayload, TeamMemberWorkPayload } from "@/lib/app-pages/team-member";
import { canManageSettings } from "@/lib/rbac/permissions";
import type { WorkActivityV1 } from "@/lib/signals/queries/get-work-activity";

export type MemberClientData = TeamMemberHubPayload & {
  section: "overview" | "coding" | "fleet" | "work";
  work: WorkActivityV1 | null;
  workExtractionEnabled: boolean;
};

const MemberDataContext = createContext<MemberClientData | null>(null);

export function useMemberClientData() {
  const value = useContext(MemberDataContext);
  if (!value) throw new Error("Member page data is unavailable.");
  return value;
}

function sectionFromPath(pathname: string): MemberClientData["section"] {
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
  const hubQuery = useAppPageQuery<TeamMemberHubPayload>(
    teamMemberHubKey(developerId, periodQuery),
    `/api/app/team/${encodeURIComponent(developerId)}${periodQuery ? `?${periodQuery}` : ""}`,
  );
  const needsWork = section === "overview" || section === "work";
  const workLimit = section === "work" ? 200 : 4;
  const workQueryString = useMemo(() => {
    const params = new URLSearchParams(periodQuery);
    params.set("slice", "work");
    params.set("limit", String(workLimit));
    return params.toString();
  }, [periodQuery, workLimit]);
  const workQuery = useAppPageQuery<TeamMemberWorkPayload>(
    teamMemberWorkKey(developerId, periodQuery, workLimit),
    `/api/app/team/${encodeURIComponent(developerId)}?${workQueryString}`,
    { enabled: needsWork && Boolean(hubQuery.data) },
  );

  if (hubQuery.isPending) return <AppPageSkeleton />;
  if (hubQuery.error) return <AppPageError error={hubQuery.error} retry={() => void hubQuery.refetch()} />;

  const { developer, role } = hubQuery.data;
  const contextValue: MemberClientData = {
    ...hubQuery.data,
    section,
    work: needsWork ? (workQuery.data?.work ?? null) : null,
    workExtractionEnabled: needsWork ? (workQuery.data?.workExtractionEnabled ?? false) : false,
  };

  return (
    <MemberDataContext.Provider value={contextValue}>
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
            <MemberRoleSelect developerId={developer.id} role={developer.role} memberName={developer.name} />
            <MemberRemoveButton developerId={developer.id} memberName={developer.name} locked={developer.role === "owner"} />
          </div>
        ) : <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Role: {developer.role}</p>}
        <MemberHubNav developerId={developerId} />
      </PageHeader>
      {workQuery.error && needsWork ? (
        <AppPageError error={workQuery.error} retry={() => void workQuery.refetch()} />
      ) : null}
      {children}
    </MemberDataContext.Provider>
  );
}
