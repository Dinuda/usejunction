import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { MemberHubNav } from "@/components/developers/member-hub-nav";
import { MemberHubPeriodFilter } from "@/components/developers/member-hub-period";
import { MemberRemoveButton } from "@/components/developers/member-remove-button";
import { MemberRoleSelect } from "@/components/developers/member-role-select";
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
      <div className="mb-8">
        <Link
          href="/team"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to roster
        </Link>
      </div>
      <header className="mb-8 space-y-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.15rem]">
              {developer.name}.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {developer.email} · work, tools, and plan pace.
            </p>
            {canManageSettings(role) ? (
              <div className="mt-4 flex items-center gap-4">
                <MemberRoleSelect developerId={developer.id} role={developer.role} />
                <MemberRemoveButton
                  developerId={developer.id}
                  memberName={developer.name}
                  locked={developer.role === "owner"}
                />
              </div>
            ) : (
              <p className="mt-3 text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Role: {developer.role}
              </p>
            )}
          </div>
          <Suspense fallback={null}>
            <MemberHubPeriodFilter className="shrink-0 self-start lg:self-end" />
          </Suspense>
        </div>
        <Suspense fallback={null}>
          <MemberHubNav developerId={developerId} />
        </Suspense>
      </header>
      {children}
    </>
  );
}
