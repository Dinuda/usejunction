export function normalizeDeviceSource(source: string): string {
  if (
    source === "cursor_usage_events" ||
    source === "local_scan" ||
    source === "cursor_local" ||
    source === "vendor_verified" ||
    source === "integration_verified"
  ) {
    return "device_observed";
  }
  return source;
}

export function deviceCostKind(estimatedCost: number): string | null {
  return estimatedCost > 0 ? "estimated_api" : null;
}
