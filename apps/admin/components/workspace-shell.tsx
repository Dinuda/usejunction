"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Home,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import {
  ActivePlanBadge,
  PlanStatusCard,
  shouldShowSidebarPlanCard,
} from "@/components/saas-billing/plan-status-card";
import { SignalsMark } from "@/components/signals/signals-mark";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { WorkspaceUserMenu } from "@/components/workspace-user-menu";
import type { OrgBillingStatus } from "@/lib/saas-billing/status";
import { canManageSettings, canSeeOrgOverview } from "@/lib/rbac/permissions";
import type { OrganizationRole } from "@/lib/rbac/permissions";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type NavIcon = LucideIcon | typeof SignalsMark;
type NavItem = readonly [href: string, label: string, icon: NavIcon];

const adminNav: NavItem[] = [
  ["/dashboard", "Home", Home],
  ["/team", "Team", Users],
  ["/signals", "Signals", SignalsMark],
  ["/tools", "Tools", Wrench],
  ["/activity", "Activity", Activity],
  ["/settings", "Settings", Settings],
];

const managerNav: NavItem[] = [
  ["/dashboard", "Home", Home],
  ["/team", "Team", Users],
  ["/signals", "Signals", SignalsMark],
  ["/tools", "Tools", Wrench],
  ["/activity", "Activity", Activity],
];

const userNav: NavItem[] = [
  ["/dashboard", "Home", Home],
  ["/tools", "My tools", Wrench],
  ["/activity", "My activity", Activity],
];

function navForRole(role: OrganizationRole | null) {
  if (canManageSettings(role)) return adminNav;
  if (canSeeOrgOverview(role)) return managerNav;
  return userNav;
}

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
  const nav = navForRole(role);
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b px-4 py-0">
        <Link
          href="/dashboard"
          className="flex h-full items-center gap-3 overflow-hidden"
          onClick={() => setOpenMobile(false)}
        >
          <BrandLogo className="h-8 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-5">
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(([href, label, Icon]) => {
                const isActive =
                  href === "/dashboard"
                    ? active === href || active.startsWith(`${href}?`)
                    : active === href || active.startsWith(`${href}/`) || active.startsWith(`${href}?`);
                return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                    <Link
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Icon aria-hidden="true" />
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
          {shouldShowSidebarPlanCard(billing) ? (
            <PlanStatusCard billing={billing} />
          ) : (
            <ActivePlanBadge billing={billing} onNavigate={() => setOpenMobile(false)} />
          )}
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
      className="h-dvh min-h-dvh overflow-hidden"
    >
      <AppSidebar active={pathname} role={role} billing={billing} />
      <SidebarInset className="h-dvh min-h-0 min-w-0 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-none bg-white px-3 backdrop-blur-sm sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
            <SidebarTrigger className="-ml-1 size-11 shrink-0 md:hidden" />
            <Link
              href="/dashboard"
              aria-label="UseJunction dashboard"
              className="flex shrink-0 items-center md:hidden"
            >
              <BrandLogo className="h-5 w-auto min-[360px]:h-6" />
            </Link>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-6">
            <WorkspaceSwitcher
              organizations={organizations}
              currentOrgId={currentOrgId}
              role={role}
              className="h-11 min-w-0 w-[clamp(5.25rem,27vw,9rem)] px-2 sm:h-9 sm:w-auto sm:min-w-[12rem] sm:max-w-[18rem] sm:px-3"
            />
            <WorkspaceUserMenu name={name} email={email} image={image} role={role} />
          </div>
        </header>
        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
