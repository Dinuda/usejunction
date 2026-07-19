export function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nextWorkExtractionStartedAt(input: {
  wasEnabled: boolean;
  enabled: boolean;
  existingStartedAt: Date | string | null | undefined;
  now: Date;
}): Date | null {
  if (!input.enabled) return null;
  if (!input.wasEnabled) return input.now;
  return validDate(input.existingStartedAt) ?? input.now;
}

/** The device may only report work observed after both consent boundaries. */
export function deviceWorkExtractionStartedAt(
  policyStartedAt: Date | string | null | undefined,
  deviceCreatedAt: Date | string,
): Date | null {
  const policy = validDate(policyStartedAt);
  const device = validDate(deviceCreatedAt);
  if (!policy || !device) return null;
  return policy >= device ? policy : device;
}

export function isObservedAtEligible(
  observedAt: Date | string,
  collectionStartedAt: Date | string,
) {
  const observed = validDate(observedAt);
  const started = validDate(collectionStartedAt);
  return Boolean(observed && started && observed >= started);
}
