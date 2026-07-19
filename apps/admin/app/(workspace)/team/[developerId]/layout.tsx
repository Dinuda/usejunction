import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { MemberHubNav } from "@/components/developers/member-hub-nav";
import { MemberHubPeriodFilter } from "@/components/developers/member-hub-period";
import { MemberRemoveButton } from "@/components/developers/member-remove-button";
import { MemberRoleSelect } from "@/components/developers/member-role-select";
import { PageHeader } from "@/components/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { loadMemberIdentity } from "@/lib/developers/member-page-context";
import { canManageSettings } from "@/lib/rbac";

export default async function MemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ developerId: string }>;
}) {
  const { developerId } = await params;
  const { role, developer } = await loadMemberIdentity(developerId);

  return (
    <>
      <PageHeader
        className="mb-8"
        eyebrow={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/team">Team</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{developer.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={`${developer.name}.`}
        description={`${developer.email} · work, tools, and plan pace.`}
        actions={
          <Suspense fallback={null}>
            <MemberHubPeriodFilter className="shrink-0 self-start sm:self-end" />
          </Suspense>
        }
      >
        {canManageSettings(role) ? (
          <div className="flex items-center gap-4">
            <MemberRoleSelect developerId={developer.id} role={developer.role} />
            <MemberRemoveButton
              developerId={developer.id}
              memberName={developer.name}
              locked={developer.role === "owner"}
            />
          </div>
        ) : (
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Role: {developer.role}
          </p>
        )}
        <Suspense fallback={null}>
          <MemberHubNav developerId={developerId} />
        </Suspense>
      </PageHeader>
      {children}
    </>
  );
}
