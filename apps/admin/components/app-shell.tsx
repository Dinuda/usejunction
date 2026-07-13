import Link from "next/link";
import { cn } from "@/lib/utils";
import { getWorkspaceContext, type OrganizationRole } from "@/lib/workspace-context";
import { BrandLogo } from "@/components/brand-logo";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { WorkspaceUserMenu } from "@/components/workspace-user-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const adminNav = [
  ["/dashboard", "Home"],
  ["/team", "Team"],
  ["/tools", "Tools"],
  ["/activity", "Activity"],
] as const;

const developerNav = [
  ["/dashboard", "Home"],
  ["/tools", "My tools"],
  ["/activity", "My activity"],
] as const;

export function AppSidebar({ active, role }: { active: string; role: OrganizationRole | null }) {
  const nav = role === "owner" || role === "admin" ? adminNav : developerNav;

  return (
    <Sidebar collapsible="none" variant="sidebar" className="border-r">
      <SidebarHeader className="border-b p-4">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
          <BrandLogo className="h-8 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(([href, label]) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={active === href} tooltip={label}>
                    <Link href={href} aria-current={active === href ? "page" : undefined}>
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export async function Shell({ active, children }: { active: string; children: React.ReactNode }) {
  const ctx = await getWorkspaceContext();

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar active={active} role={ctx?.role ?? null} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher
              organizations={ctx?.organizations ?? []}
              currentOrgId={ctx?.orgId ?? null}
            />
          </div>
          <WorkspaceUserMenu
            name={ctx?.name}
            email={ctx?.email}
            image={ctx?.image}
            role={ctx?.role}
          />
        </header>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "success" | "warning" | "error" }) {
  const classes = {
    default: "border-border bg-muted text-muted-foreground",
    success: "border-green-200 bg-green-50 text-green-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-800",
  };
  return <Badge variant="outline" className={cn("text-[0.65rem] uppercase tracking-[0.08em]", classes[variant])}>{children}</Badge>;
}

export function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="w-full overflow-x-auto border border-border bg-card">
      <ShadcnTable>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header} className="h-11 whitespace-nowrap px-4 text-[0.65rem] font-medium uppercase tracking-[0.08em]">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={headers.length} className="h-24 text-center text-sm text-muted-foreground">
                No data yet
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={index}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} className="whitespace-nowrap px-4 py-3 text-sm">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </ShadcnTable>
    </div>
  );
}
