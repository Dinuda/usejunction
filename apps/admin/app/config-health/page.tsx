import { Shell, PageHeader, Table, StatCard, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface Issue {
  severity: "warning" | "error";
  message: string;
  context: string;
}

interface ToolInstall {
  id: string;
  toolName: string;
  detected: boolean;
  configured: boolean;
  version: string | null;
  lastCheckedAt: string;
  user: { name: string; email: string } | null;
  device: { hostname: string } | null;
}

interface Account {
  id: string;
  toolName: string;
  email: string | null;
  plan: string | null;
  loginMethod: string;
  authPresent: boolean;
  user: { name: string; email: string } | null;
  device: { hostname: string } | null;
}

interface QuotaRow {
  id: string;
  toolName: string;
  windowType: string;
  usedPercent: number | null;
  creditsRemaining: number | null;
  resetAt: string | null;
  updatedAt: string;
  device: { hostname: string } | null;
}

interface ConfigHealthData {
  tools: ToolInstall[];
  accounts: Account[];
  quotas: QuotaRow[];
  issues: Issue[];
  healthScore: number | null;
}

export default async function ConfigHealthPage() {
  let data: ConfigHealthData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<ConfigHealthData>("/api/dashboard/config-health");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load config health";
  }

  const errors = data?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnings = data?.issues.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <Shell active="/config-health">
      <PageHeader title="Config Health" description="Tool configuration and auth status across devices" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-4 gap-4">
            <StatCard
              label="Health Score"
              value={data.healthScore !== null ? `${data.healthScore}%` : "—"}
              sub="tools configured"
            />
            <StatCard label="Tools Tracked" value={data.tools.length} />
            <StatCard label="Errors" value={errors} sub={errors > 0 ? "action required" : "none"} />
            <StatCard label="Warnings" value={warnings} />
          </div>

          {data.issues.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Issues</h2>
              <div className="space-y-2">
                {data.issues.map((issue, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                      issue.severity === "error"
                        ? "border-red-500/20 bg-red-500/5"
                        : "border-amber-500/20 bg-amber-500/5"
                    }`}
                  >
                    <StatusBadge variant={issue.severity === "error" ? "error" : "warning"}>
                      {issue.severity}
                    </StatusBadge>
                    <span className="flex-1 text-zinc-200">{issue.message}</span>
                    <span className="text-xs text-zinc-500">{issue.context}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-zinc-400">Tool installations</h2>
            <Table
              headers={["Tool", "Developer", "Device", "Detected", "Configured", "Version", "Last Checked"]}
              rows={data.tools.map((t) => [
                t.toolName,
                t.user?.name ?? "—",
                <span key="d" className="font-mono text-xs">{t.device?.hostname ?? "—"}</span>,
                <StatusBadge key="det" variant={t.detected ? "success" : "default"}>{t.detected ? "yes" : "no"}</StatusBadge>,
                <StatusBadge key="cfg" variant={t.configured ? "success" : "warning"}>{t.configured ? "yes" : "no"}</StatusBadge>,
                <span key="v" className="font-mono text-xs text-zinc-500">{t.version ?? "—"}</span>,
                new Date(t.lastCheckedAt).toLocaleString(),
              ])}
            />
          </div>

          {data.accounts.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Tool accounts</h2>
              <Table
                headers={["Tool", "Developer", "Account Email", "Plan", "Auth", "Login Method"]}
                rows={data.accounts.map((a) => [
                  a.toolName,
                  a.user?.name ?? "—",
                  <span key="e" className="text-xs text-zinc-500">{a.email ?? "—"}</span>,
                  a.plan ?? "—",
                  <StatusBadge key="auth" variant={a.authPresent ? "success" : "error"}>{a.authPresent ? "present" : "missing"}</StatusBadge>,
                  <span key="lm" className="text-xs text-zinc-500">{a.loginMethod}</span>,
                ])}
              />
            </div>
          )}

          {data.quotas.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Quota snapshots</h2>
              <Table
                headers={["Tool", "Device", "Window", "Used %", "Credits Left", "Resets At"]}
                rows={data.quotas.map((q) => [
                  q.toolName,
                  <span key="d" className="font-mono text-xs">{q.device?.hostname ?? "—"}</span>,
                  q.windowType,
                  q.usedPercent !== null ? (
                    <StatusBadge
                      key="u"
                      variant={q.usedPercent > 95 ? "error" : q.usedPercent > 80 ? "warning" : "success"}
                    >
                      {q.usedPercent.toFixed(0)}%
                    </StatusBadge>
                  ) : "—",
                  q.creditsRemaining !== null ? q.creditsRemaining.toFixed(0) : "—",
                  q.resetAt ? new Date(q.resetAt).toLocaleDateString() : "—",
                ])}
              />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
