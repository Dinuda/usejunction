export type ProviderIncident = {
  provider: string;
  status: "operational" | "degraded" | "outage" | "unknown";
  description?: string;
};

const STATUSPAGE_FEEDS = [
  { provider: "OpenAI", url: "https://status.openai.com/api/v2/status.json" },
  { provider: "Anthropic", url: "https://status.anthropic.com/api/v2/status.json" },
  { provider: "Cursor", url: "https://status.cursor.com/api/v2/status.json" },
];

export async function fetchProviderIncidents(): Promise<ProviderIncident[]> {
  const results = await Promise.all(
    STATUSPAGE_FEEDS.map(async ({ provider, url }) => {
      try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return { provider, status: "unknown" as const };
        const data = await res.json();
        const indicator = data?.status?.indicator as string | undefined;
        const description = data?.status?.description as string | undefined;
        let status: ProviderIncident["status"] = "unknown";
        if (indicator === "none") status = "operational";
        else if (indicator === "minor" || indicator === "maintenance") status = "degraded";
        else if (indicator) status = "outage";
        return { provider, status, description };
      } catch {
        return { provider, status: "unknown" as const };
      }
    })
  );
  return results;
}

export async function pollLiteLLMBudget() {
  const base = process.env.LITELLM_URL || "http://localhost:4000";
  const key = process.env.LITELLM_MASTER_KEY || "sk-usejunction-master";
  try {
    const res = await fetch(`${base}/key/info?key=${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
