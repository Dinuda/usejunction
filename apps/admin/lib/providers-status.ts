export type ProviderStatus = {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  latencyMs?: number;
  lastCheckedAt?: string;
};

const KNOWN_PROVIDERS = ["openai", "anthropic", "google", "mistral", "ollama", "groq", "azure"];

export function getProviderDisplayName(provider: string): string {
  const map: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google Gemini",
    mistral: "Mistral",
    ollama: "Ollama (local)",
    groq: "Groq",
    azure: "Azure OpenAI",
  };
  return map[provider.toLowerCase()] ?? provider;
}

export function inferProviderFromModel(model: string): string {
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("mistral") || model.startsWith("mixtral")) return "mistral";
  if (model.startsWith("llama") || model.startsWith("deepseek")) return "ollama";
  return "unknown";
}

export { KNOWN_PROVIDERS };
