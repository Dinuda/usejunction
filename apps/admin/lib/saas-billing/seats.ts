/** Team always bills the current active roster, with one minimum checkout unit. */
export function activeSeatQuantity(activeDeveloperCount: number): number {
  if (!Number.isInteger(activeDeveloperCount) || activeDeveloperCount < 0) {
    throw new Error("active developer count must be a non-negative whole number");
  }
  return Math.max(1, activeDeveloperCount);
}
