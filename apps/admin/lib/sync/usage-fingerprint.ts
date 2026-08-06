const FIXED_AGENT_VERSION = [0, 4, 9] as const;

function parseCoreVersion(value: string): [number, number, number] | null {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Agents through 0.4.8 may send the legacy truncated cost fingerprint. */
export function allowsLegacyCostFingerprint(agentVersion: string | null | undefined): boolean {
  const parsed = parseCoreVersion(agentVersion ?? "");
  if (!parsed) return false;
  for (let index = 0; index < FIXED_AGENT_VERSION.length; index += 1) {
    const part = parsed[index]!;
    const fixed = FIXED_AGENT_VERSION[index]!;
    if (part < fixed) return true;
    if (part > fixed) return false;
  }
  return false;
}

function fingerprintFields(value: string): Map<string, string> | null {
  const fields = new Map<string, string>();
  for (const part of value.split(",")) {
    const separator = part.indexOf(":");
    if (separator <= 0) return null;
    const key = part.slice(0, separator);
    if (fields.has(key)) return null;
    fields.set(key, part.slice(separator + 1));
  }
  return fields.size > 0 ? fields : null;
}

/**
 * Compatibility for the Go <=0.4.8 USD-to-micros truncation bug.
 * The server stores the rounded fingerprint, so the legacy incoming cost may
 * be exactly one micro lower. Every other canonical field must match.
 */
export function usageFingerprintsEquivalent(
  stored: string | null | undefined,
  incoming: string,
  allowLegacyCost: boolean,
): boolean {
  if (stored === incoming) return true;
  if (!stored || !allowLegacyCost) return false;
  const storedFields = fingerprintFields(stored);
  const incomingFields = fingerprintFields(incoming);
  if (!storedFields || !incomingFields || storedFields.size !== incomingFields.size) return false;

  for (const [key, value] of storedFields) {
    if (key === "cost") continue;
    if (incomingFields.get(key) !== value) return false;
  }
  const storedCost = Number(storedFields.get("cost"));
  const incomingCost = Number(incomingFields.get("cost"));
  return Number.isSafeInteger(storedCost) && Number.isSafeInteger(incomingCost) && storedCost === incomingCost + 1;
}
