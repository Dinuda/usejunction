import { z } from "zod";

export const microsInput = z.union([z.string(), z.number()])
  .refine((value) => /^\d+$/.test(String(value)), "must be a non-negative integer in micros")
  .transform((value) => BigInt(String(value)));

export const dateOnlyInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD").transform((value) => new Date(`${value}T00:00:00.000Z`));

export const planTemplateSchema = z.object({
  provider: z.string().trim().min(1).max(64),
  product: z.string().trim().min(1).max(64),
  toolName: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  tier: z.string().trim().max(80).optional().nullable(),
  toolKey: z.string().trim().min(1).max(80).optional().nullable(),
  catalogPlanKey: z.string().trim().min(1).max(80).optional().nullable(),
  billingCadence: z.enum(["weekly", "monthly", "annual", "custom"]).default("monthly"),
  billingCycleAnchorDate: dateOnlyInput.optional().nullable(),
  nextRenewalDate: dateOnlyInput.optional().nullable(),
  billingCycleDays: z.number().int().positive().optional().nullable(),
  seatCapacity: z.number().int().min(0).max(100_000).default(1),
  priceSource: z.string().trim().min(1).max(80).default("manual"),
  priceVerifiedAt: dateOnlyInput.optional().nullable(),
  customPrice: z.boolean().default(true),
  providerSourceUrl: z.string().trim().url().max(2000).optional().nullable(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).default("USD"),
  cycleSeatMicros: microsInput.default(BigInt(0)),
  includedCycleMicros: microsInput.default(BigInt(0)),
  inputRateMicrosPerMillion: microsInput.default(BigInt(0)),
  outputRateMicrosPerMillion: microsInput.default(BigInt(0)),
  cacheRateMicrosPerMillion: microsInput.default(BigInt(0)),
  billingOwner: z.string().trim().max(160).optional().nullable(),
  externalReference: z.string().trim().max(160).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

const assignmentBaseSchema = z.object({
  planTemplateId: z.string().trim().min(1),
  toolName: z.string().trim().min(1).max(64).optional(),
  startDate: dateOnlyInput,
  endDate: dateOnlyInput.optional().nullable(),
  seatCount: z.number().int().min(1).max(100_000).default(1),
  seatStatus: z.string().trim().min(1).max(40).default("active"),
  cycleSeatMicros: microsInput.optional(),
  includedCycleMicros: microsInput.optional(),
  inputRateMicrosPerMillion: microsInput.optional(),
  outputRateMicrosPerMillion: microsInput.optional(),
  cacheRateMicrosPerMillion: microsInput.optional(),
  vendorAccountEmail: z.string().trim().email().max(320).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const assignmentSchema = assignmentBaseSchema.superRefine((value, context) => {
  if (value.endDate && value.endDate <= value.startDate) context.addIssue({ code: "custom", path: ["endDate"], message: "end date must be after start date" });
});

export const assignmentUpdateSchema = assignmentBaseSchema.partial();

export function serializeBigInts<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) as T;
}

export function dateString(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}
