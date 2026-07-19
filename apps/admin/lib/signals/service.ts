import { prisma } from "@usejunction/db";
import { enforceDeviceActivityRetention } from "@/lib/activity/record-device-activity-event";
import {
  SIGNALS_COLLECTION_MODE,
  SIGNALS_DEFAULT_RETENTION_DAYS,
  defaultExcludedApps,
  defaultExcludedDomains,
  normalizeList,
} from "./contracts";

export type EffectiveSignalsPolicy = {
  enabled: boolean;
  retentionDays: number;
  collectionMode: typeof SIGNALS_COLLECTION_MODE;
  excludedApps: string[];
  excludedDomains: string[];
  storeEvents: boolean;
  workExtractionEnabled: boolean;
  rawWorkTextEnabled: boolean;
  workExtractionStartedAt: string | null;
  updatedAt: string | null;
};

export function disabledSignalsPolicy(): EffectiveSignalsPolicy {
  return {
    enabled: false,
    retentionDays: SIGNALS_DEFAULT_RETENTION_DAYS,
    collectionMode: SIGNALS_COLLECTION_MODE,
    excludedApps: normalizeList(undefined, defaultExcludedApps),
    excludedDomains: normalizeList(undefined, defaultExcludedDomains),
    storeEvents: false,
    workExtractionEnabled: false,
    rawWorkTextEnabled: false,
    workExtractionStartedAt: null,
    updatedAt: null,
  };
}

export async function getEffectiveSignalsPolicy(orgId: string, teamId?: string | null): Promise<EffectiveSignalsPolicy> {
  const policies = await prisma.signalsPolicy.findMany({
    where: { orgId, OR: [{ teamId: teamId ?? undefined }, { teamId: null }] },
    orderBy: [{ teamId: "desc" }, { updatedAt: "desc" }],
    take: 2,
  });
  const policy = policies.find((item) => item.teamId === teamId) ?? policies.find((item) => item.teamId === null);
  if (!policy) return disabledSignalsPolicy();
  return {
    // Classic app/domain journey sampling is off for this release.
    enabled: false,
    retentionDays: policy.retentionDays,
    collectionMode: SIGNALS_COLLECTION_MODE,
    excludedApps: normalizeList(policy.excludedApps, defaultExcludedApps),
    excludedDomains: normalizeList(policy.excludedDomains, defaultExcludedDomains),
    storeEvents: false,
    // Work extraction is independent of classic app/domain collection.
    workExtractionEnabled: policy.workExtractionEnabled,
    rawWorkTextEnabled: policy.rawWorkTextEnabled,
    workExtractionStartedAt: policy.workExtractionStartedAt?.toISOString() ?? null,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export async function getOrgSignalsPolicy(orgId: string): Promise<EffectiveSignalsPolicy> {
  return getEffectiveSignalsPolicy(orgId, null);
}

export async function enforceSignalsRetention(orgId: string, retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await prisma.signalsSession.deleteMany({ where: { orgId, startedAt: { lt: cutoff } } });
  await prisma.signalsActivityEvent.deleteMany({ where: { orgId, observedAt: { lt: cutoff } } });
  await prisma.localWorkSession.deleteMany({ where: { orgId, observedAt: { lt: cutoff } } });
  await enforceDeviceActivityRetention(orgId);
}
