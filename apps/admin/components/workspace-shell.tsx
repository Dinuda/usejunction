"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { PlanStatusCard } from "@/components/billing/plan-status-card";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { WorkspaceUserMenu } from "@/components/workspace-user-menu";
import type { OrgBillingStatus } from "@/lib/billing/status";
import type { OrganizationRole } from "@/lib/workspace-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

const adminNav = [
  ["/dashboard", "Home"],
  ["/team", "Team"],
  ["/signals", "Signals"],
  ["/tools", "Tools"],
  ["/activity", "Activity"],
  ["/settings", "Settings"],
] as const;

const developerNav = [
  ["/dashboard", "Home"],
  ["/tools", "My tools"],
  ["/activity", "My activity"],
] as const;

type WorkspaceShellProps = {
  organizations: Array<{ id: string; name: string; color: string | null; role: OrganizationRole }>;
  currentOrgId: string | null;
  role: OrganizationRole | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  billing: OrgBillingStatus | null;
  children: React.ReactNode;
};

function AppSidebar({
  active,
  role,
  billing,
}: {
  active: string;
  role: OrganizationRole | null;
  billing: OrgBillingStatus | null;
}) {
  const nav = role === "owner" || role === "admin" ? adminNav : developerNav;

  return (
    <Sidebar collapsible="none" variant="sidebar" className="h-full border-r md:h-svh">
      <SidebarHeader className="h-14 justify-center border-b px-4 py-0">
        <Link href="/dashboard" className="flex h-full items-center gap-3 overflow-hidden">
          <BrandLogo className="h-8 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(([href, label]) => {
                const isActive =
                  href === "/dashboard"
                    ? active === href || active.startsWith(`${href}?`)
                    : active === href || active.startsWith(`${href}/`) || active.startsWith(`${href}?`);
                return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                    <Link href={href} aria-current={isActive ? "page" : undefined}>
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {billing && (
        <SidebarFooter className="mt-auto shrink-0 border-t-0 p-2 pt-0">
          <PlanStatusCard billing={billing} />
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export function WorkspaceShell({
  organizations,
  currentOrgId,
  role,
  name,
  email,
  image,
  billing,
  children,
}: WorkspaceShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider
      defaultOpen
      className="grid h-svh grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[var(--sidebar-width)_1fr] md:grid-rows-1"
    >
      <AppSidebar active={pathname} role={role} billing={billing} />
      <SidebarInset className="min-h-0 overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher organizations={organizations} currentOrgId={currentOrgId} role={role} />
          </div>
          <WorkspaceUserMenu name={name} email={email} image={image} role={role} />
        </header>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
