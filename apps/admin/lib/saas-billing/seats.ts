/**
 * Developer seat quantity rules for Team checkout and capacity.
 */
export const MAX_TEAM_SEATS = 500;

export type ResolveCheckoutQuantityResult =
  | { ok: true; quantity: number; minSeats: number }
  | { ok: false; error: string; minSeats: number };

/** Resolve checkout quantity: floor = active roster, optional request, hard max. */
export function resolveCheckoutQuantity(input: {
  activeDeveloperCount: number;
  requested?: number | null;
}): ResolveCheckoutQuantityResult {
  const minSeats = Math.max(1, input.activeDeveloperCount);

  if (input.requested === undefined || input.requested === null) {
    return { ok: true, quantity: minSeats, minSeats };
  }

  if (!Number.isFinite(input.requested) || !Number.isInteger(input.requested)) {
    return { ok: false, error: "quantity must be a whole number", minSeats };
  }

  if (input.requested > MAX_TEAM_SEATS) {
    return { ok: false, error: `quantity cannot exceed ${MAX_TEAM_SEATS}`, minSeats };
  }

  if (input.requested < minSeats) {
    return {
      ok: false,
      error: `quantity must be at least ${minSeats} (current developers on the roster)`,
      minSeats,
    };
  }

  return { ok: true, quantity: input.requested, minSeats };
}

export type SeatCapacityDecision =
  | { allowed: true }
  | { allowed: false; message: string };

/** Pure seat-capacity check for paid Team/Enterprise orgs. */
export function evaluateSeatCapacity(input: {
  isPaidPlan: boolean;
  purchasedSeats: number | null;
  activeDeveloperCount: number;
  /** When true, linking would add one more active developer. */
  wouldConsumeSeat: boolean;
}): SeatCapacityDecision {
  if (!input.isPaidPlan) {
    return { allowed: true };
  }

  if (!input.wouldConsumeSeat) {
    return { allowed: true };
  }

  const purchased = input.purchasedSeats;
  if (purchased === null || purchased === undefined || purchased < 1) {
    return {
      allowed: false,
      message: "No developer seats purchased. Add seats to invite more people.",
    };
  }

  if (input.activeDeveloperCount >= purchased) {
    return {
      allowed: false,
      message: `All ${purchased} seats are used. Add seats to invite more.`,
    };
  }

  return { allowed: true };
}
