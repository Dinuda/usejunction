import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { label: "Requests (24h)", value: "12,847" },
  { label: "Est. Cost", value: "$284.50" },
  { label: "Avg Latency", value: "1.2s" },
  { label: "Error Rate", value: "0.8%" },
  { label: "Active Devs", value: "24" },
  { label: "Devices Online", value: "31/33" },
];

const topModels = [
  { name: "claude-sonnet-4", tokens: "4.2M" },
  { name: "gpt-4.1", tokens: "2.8M" },
  { name: "cursor-small", tokens: "1.1M" },
];

const topUsers = [
  { name: "sarah@acme.dev", cost: "$48.20" },
  { name: "alex@acme.dev", cost: "$36.10" },
  { name: "morgan@acme.dev", cost: "$29.80" },
];

const recentRequests = [
  { tool: "Cursor", model: "claude-sonnet-4", latency: "890ms", status: "ok" },
  { tool: "Claude Code", model: "claude-opus-4", latency: "2.1s", status: "ok" },
  { tool: "Windsurf", model: "gpt-4.1", latency: "1.4s", status: "warn" },
];

export function ProductPreview() {
  return (
    <section id="preview" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">See everything in one place</h2>
          <p className="mt-3 text-muted-foreground">
            A unified dashboard for usage, cost, latency, and device health across your team.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/5">
          <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-500/60" />
            <div className="h-3 w-3 rounded-full bg-amber-500/60" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
            <span className="ml-2 text-xs text-muted-foreground">UseJunction Admin</span>
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {stats.map((stat) => (
                <Card key={stat.label} className="border-border/50 bg-background/50">
                  <CardContent className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold sm:text-xl">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-border/50 bg-background/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Top Models</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topModels.map((m) => (
                    <div key={m.name} className="flex justify-between text-sm">
                      <span className="truncate font-mono text-xs sm:text-sm">{m.name}</span>
                      <span className="text-muted-foreground">{m.tokens}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-background/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Top Users</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topUsers.map((u) => (
                    <div key={u.name} className="flex justify-between text-sm">
                      <span className="truncate">{u.name}</span>
                      <span className="text-muted-foreground">{u.cost}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-background/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Recent Requests</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentRequests.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{r.tool}</span>
                      <Badge
                        variant="secondary"
                        className={
                          r.status === "warn"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }
                      >
                        {r.latency}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
