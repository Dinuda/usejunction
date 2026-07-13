import { cn } from "@/lib/utils";
import { getOrgBillingStatus } from "@/lib/billing/status";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-[#9a5f0d]",
    error: "border-destructive/30 bg-destructive/10 text-destructive",
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
