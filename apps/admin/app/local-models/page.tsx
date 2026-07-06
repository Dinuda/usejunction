import { Shell, PageHeader, StatusBadge, Table } from "@/components/app-shell";
import { timeAgo } from "@/lib/utils";
import { serverFetch } from "@/lib/server-fetch";

async function getLocalModels() {
  return serverFetch("/api/dashboard/local-models") ?? { models: [] };
}

export default async function LocalModelsPage() {
  const { models } = await getLocalModels();

  return (
    <Shell active="/local-models">
      <PageHeader title="Local Models" description="Ollama and LM Studio models on developer machines" />
      <Table
        headers={["Device", "User", "Provider", "Model", "Size", "Running", "Last Seen"]}
        rows={models.map((m: {
          device: string;
          user: string;
          provider: string;
          modelName: string;
          size: string | null;
          running: boolean;
          lastSeenAt: string;
        }) => [
          m.device,
          m.user,
          m.provider,
          m.modelName,
          m.size || "—",
          <StatusBadge key="r" variant={m.running ? "success" : "default"}>{m.running ? "running" : "stopped"}</StatusBadge>,
          timeAgo(m.lastSeenAt),
        ])}
      />
    </Shell>
  );
}
