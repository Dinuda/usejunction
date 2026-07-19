export function resolveProviderApiKeyMapping(
  existing: { developerId: string | null; mappingSource: string | null } | null,
  ownerDeveloperId: string | null,
) {
  if (existing?.mappingSource === "manual") {
    return { developerId: existing.developerId, mappingSource: "manual" as const };
  }
  return {
    developerId: ownerDeveloperId,
    mappingSource: ownerDeveloperId ? "provider_owner" as const : null,
  };
}
