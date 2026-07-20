import { z } from "zod";

const semanticVersionSchema = z.string().refine((value) => {
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/);
  if (!match) return false;
  return !match[4] || match[4].split(".").every((part) => !/^\d+$/.test(part) || part === "0" || !part.startsWith("0"));
}, "Invalid semantic version");

export const agentUpdateEvents = [
  "download_started",
  "download_completed",
  "install_started",
  "install_failed",
  "install_confirmed",
  "rollback_started",
  "rollback_confirmed",
] as const;

export type AgentUpdateEventType = (typeof agentUpdateEvents)[number];

export const releaseArtifactSchema = z.object({
  url: z.string().min(1).max(2048),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  size: z.number().int().positive().max(100 * 1024 * 1024),
});

const legacyArtifactKeys = ["darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64"] as const;
const currentArtifactKeys = [...legacyArtifactKeys, "windows-amd64", "windows-arm64"] as const;

const manifestFields = {
  version: semanticVersionSchema,
  publishedAt: z.string().datetime(),
  urgency: z.enum(["normal", "critical"]),
  rolloutHours: z.number().int().min(0).max(168),
  artifacts: z.record(z.string(), releaseArtifactSchema),
  signingKeyId: z.string().trim().min(1).max(128),
  signature: z.string().regex(/^[A-Za-z0-9_-]{64,256}$/),
};

function validateManifest(
  requiredKeys: readonly string[],
  manifest: { artifacts: Record<string, z.infer<typeof releaseArtifactSchema>> },
  context: z.RefinementCtx,
) {
  for (const key of requiredKeys) {
    if (!manifest.artifacts[key]) {
      context.addIssue({ code: "custom", path: ["artifacts", key], message: `Missing required artifact ${key}` });
    }
  }
  for (const [key, artifact] of Object.entries(manifest.artifacts)) {
    try {
      const parsed = new URL(artifact.url);
      const loopback = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !loopback) {
        context.addIssue({ code: "custom", path: ["artifacts", key, "url"], message: "Artifact URL must use HTTPS outside loopback" });
      }
    } catch {
      context.addIssue({ code: "custom", path: ["artifacts", key, "url"], message: "Artifact URL must be absolute" });
    }
  }
}

const legacyAgentReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  ...manifestFields,
}).superRefine((manifest, context) => validateManifest(legacyArtifactKeys, manifest, context));

const currentAgentReleaseManifestSchema = z.object({
  schemaVersion: z.literal(2),
  ...manifestFields,
}).superRefine((manifest, context) => validateManifest(currentArtifactKeys, manifest, context));

/** v1 remains readable for active legacy releases; every new release is v2. */
export const agentReleaseManifestSchema = z.union([
  currentAgentReleaseManifestSchema,
  legacyAgentReleaseManifestSchema,
]);

export type AgentReleaseManifest = z.infer<typeof agentReleaseManifestSchema>;

export const agentUpdateEventSchema = z.object({
  attemptId: z.string().min(1).max(128),
  eventId: z.string().min(1).max(128),
  releaseVersion: semanticVersionSchema,
  event: z.enum(agentUpdateEvents),
  currentVersion: z.string().max(64).optional(),
  targetVersion: z.string().max(64),
  stage: z.string().max(64).optional(),
  errorCode: z.string().max(64).optional(),
});

export type AgentUpdateDirective = {
  releaseId: string;
  attemptId: string;
  targetVersion: string;
  urgency: "normal" | "critical";
  artifactUrl: string;
  artifactKey: string;
  sha256: string;
  size: number;
  eligibleAt: string;
  manifest: AgentReleaseManifest;
};

/**
 * Minimum agent version that enforces the forward-only Signals collection
 * epoch. Devices below this must update before they can collect/upload work.
 */
export const WORK_EXTRACTION_MIN_AGENT_VERSION = "0.3.1";

/**
 * Minimum agent version for classic app/domain journey collection quality.
 * Reserved for a later OTA; enforcement lands when that agent ships.
 * Until then, policy `enabled` may start early sampling but product UI treats journeys as secondary.
 */
export const CLASSIC_SIGNALS_MIN_AGENT_VERSION = "0.4.0";

export function isAgentCompatibleForWorkExtraction(agentVersion: string, minVersion = WORK_EXTRACTION_MIN_AGENT_VERSION) {
  const comparison = compareAgentVersions(agentVersion, minVersion);
  return comparison !== null && comparison >= 0;
}

/** Reserved for Phase 2 classic Signals / journey quality gate. */
export function isAgentCompatibleForClassicSignals(agentVersion: string, minVersion = CLASSIC_SIGNALS_MIN_AGENT_VERSION) {
  const comparison = compareAgentVersions(agentVersion, minVersion);
  return comparison !== null && comparison >= 0;
}

export function compareAgentVersions(left: string, right: string) {
  const parse = (value: string) => {
    const normalized = value.trim().replace(/^v/, "");
    if (!semanticVersionSchema.safeParse(normalized).success) return null;
    const [core, prerelease] = normalized.split("-", 2);
    const parts = core.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
    return { core: parts.map(Number), prerelease: prerelease?.split(".") ?? [] };
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}
