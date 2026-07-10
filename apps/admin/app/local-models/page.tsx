import { Shell, PageHeader, Table, StatCard, StatusBadge } from "@/components/app-shell";
import { serverFetch } from "@/lib/server-fetch";

interface LocalModelRow {
  id: string;
  provider: string;
  modelName: string;
  size: string | null;
  running: boolean;
  lastSeenAt: string;
  user: { name: string; email: string } | null;
  device: { hostname: string; os: string } | null;
}

interface ModelSummary {
  provider: string;
  modelName: string;
  deviceCount: number;
}

interface LocalModelsData {
  models: LocalModelRow[];
  summary: ModelSummary[];
}

export default async function LocalModelsPage() {
  let data: LocalModelsData | null = null;
  let err: string | null = null;

  try {
    data = await serverFetch<LocalModelsData>("/api/dashboard/local-models");
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load local models";
  }

  const running = data?.models.filter((m) => m.running).length ?? 0;
  const uniqueModels = data?.summary.length ?? 0;

  return (
    <Shell active="/local-models">
      <PageHeader title="Local Models" description="On-device AI models (Ollama, LM Studio, etc.)" />

      {err && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {err}
        </div>
      )}

      {data && (
        <>
          <div className="mb-8 grid grid-cols-3 gap-4">
            <StatCard label="Total Instances" value={data.models.length} />
            <StatCard label="Currently Running" value={running} />
            <StatCard label="Unique Models" value={uniqueModels} />
          </div>

          {data.summary.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-zinc-400">Model summary</h2>
              <Table
                headers={["Provider", "Model", "Devices"]}
                rows={data.summary.map((s) => [
                  s.provider,
                  <span key="m" className="font-mono text-xs">{s.modelName}</span>,
                  s.deviceCount,
                ])}
              />
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-medium text-zinc-400">All instances</h2>
            <Table
              headers={["Model", "Provider", "Size", "Device", "Developer", "Running", "Last Seen"]}
              rows={data.models.map((m) => [
                <span key="mn" className="font-mono text-xs">{m.modelName}</span>,
                m.provider,
                m.size ?? "—",
                <span key="dh" className="font-mono text-xs">{m.device?.hostname ?? "—"}</span>,
                m.user?.name ?? "—",
                <StatusBadge key="r" variant={m.running ? "success" : "default"}>{m.running ? "running" : "idle"}</StatusBadge>,
                new Date(m.lastSeenAt).toLocaleString(),
              ])}
            />
          </div>
        </>
      )}
    </Shell>
  );
}
