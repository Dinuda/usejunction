import { z } from "zod";

export const SIGNALS_COLLECTION_MODE = "app_domain" as const;
export const SIGNALS_DEFAULT_RETENTION_DAYS = 90;
export const SIGNALS_MAX_BATCH = 500;

export const defaultExcludedApps = [
  "1Password",
  "Bitwarden",
  "Dashlane",
  "Keeper",
  "Keychain Access",
  "LastPass",
  "System Settings",
];

export const defaultExcludedDomains = [
  "1password.com",
  "bitwarden.com",
  "dashlane.com",
  "lastpass.com",
  "myaccount.google.com",
  "paypal.com",
];

export const forbiddenSignalsFields = [
  "clipboardText",
  "content",
  "keystrokes",
  "prompt",
  "screenshot",
  "title",
  "url",
] as const;

export const signalsPolicyInputSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(366).optional(),
  collectionMode: z.literal(SIGNALS_COLLECTION_MODE).optional(),
  excludedApps: z.array(z.string().trim().min(1).max(128)).max(200).optional(),
  excludedDomains: z.array(z.string().trim().min(1).max(253)).max(500).optional(),
  storeEvents: z.boolean().optional(),
}).strict();

export const signalsStepSchema = z.object({
  app: z.string().trim().min(1).max(128).nullable().optional(),
  domain: z.string().trim().min(1).max(253).nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
}).strict();

export const signalsSessionSchema = z.object({
  localId: z.string().trim().min(1).max(128),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  aiTool: z.string().trim().min(1).max(128),
  appBefore: z.string().trim().min(1).max(128).nullable().optional(),
  domainBefore: z.string().trim().min(1).max(253).nullable().optional(),
  appAfter: z.string().trim().min(1).max(128).nullable().optional(),
  domainAfter: z.string().trim().min(1).max(253).nullable().optional(),
  flowSignature: z.string().trim().min(1).max(255),
  confidence: z.number().min(0).max(1),
  collectionMode: z.literal(SIGNALS_COLLECTION_MODE),
  steps: z.array(signalsStepSchema).min(1).max(20),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const signalsIngestSchema = z.object({
  sessions: z.array(signalsSessionSchema).min(1).max(SIGNALS_MAX_BATCH),
}).strict();

export type SignalsPolicyInput = z.infer<typeof signalsPolicyInputSchema>;
export type SignalsSessionInput = z.infer<typeof signalsSessionSchema>;

export function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!clean || clean.length > 253) return null;
  if (clean.includes("/") || clean.includes("?") || clean.includes("#")) return null;
  return clean;
}

export function normalizeList(values: string[] | undefined, defaults: string[] = []): string[] {
  return Array.from(new Set([...(values ?? []), ...defaults].map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function containsForbiddenSignalsField(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsForbiddenSignalsField(item);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if ((forbiddenSignalsFields as readonly string[]).includes(key)) return key;
    const found = containsForbiddenSignalsField(nested);
    if (found) return found;
  }
  return null;
}
