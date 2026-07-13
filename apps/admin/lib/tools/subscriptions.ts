import { prisma } from "@usejunction/db";
import { z } from "zod";
import { dateOnlyInput, microsInput } from "@/lib/billing/validation";
import { catalogPrice, findCatalogPlan, findCatalogTool, type BillingCadence } from "./catalog";

export const subscriptionInputSchema = z.object({
  toolKey: z.string().trim().min(1),
  planKey: z.string().trim().min(1),
  billingCadence: z.enum(["monthly", "annual", "custom"]).default("monthly"),
  seatCapacity: z.number().int().min(1).max(100_000),
  monthlySeatMicros: microsInput.optional(),
  includedMonthlyMicros: microsInput.optional(),
  inputRateMicrosPerMillion: microsInput.optional(),
  outputRateMicrosPerMillion: microsInput.optional(),
  cacheRateMicrosPerMillion: microsInput.optional(),
  billingOwner: z.string().trim().max(160).optional().nullable(),
  renewalDate: dateOnlyInput.optional().nullable(),
  externalReference: z.string().trim().max(160).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export const subscriptionUpdateSchema = subscriptionInputSchema.partial().omit({ toolKey: true, planKey: true }).extend({
  active: z.boolean().optional(),
});

export function deriveSubscription(input: z.infer<typeof subscriptionInputSchema>) {
  const tool = findCatalogTool(input.toolKey);
  const plan = findCatalogPlan(input.toolKey, input.planKey);
  if (!tool || !plan) throw new Error("CATALOG_PLAN_NOT_FOUND");
  const cadence = input.billingCadence as BillingCadence;
  const catalogMicros = catalogPrice(plan, cadence);
  const customPrice = Boolean(plan.customPrice || cadence === "custom");
  if (catalogMicros === undefined && !customPrice) throw new Error("CADENCE_NOT_SUPPORTED");
  if (customPrice && input.monthlySeatMicros === undefined && catalogMicros === undefined) throw new Error("CUSTOM_PRICE_REQUIRED");

  return {
    provider: tool.provider,
    product: tool.product,
    toolName: tool.toolName,
    toolKey: tool.key,
    catalogPlanKey: plan.key,
    name: plan.name,
    tier: plan.tier,
    currency: "USD",
    billingCadence: cadence,
    seatCapacity: input.seatCapacity,
    monthlySeatMicros: customPrice ? (input.monthlySeatMicros ?? catalogMicros)! : catalogMicros!,
    includedMonthlyMicros: input.includedMonthlyMicros ?? plan.includedMonthlyMicros,
    inputRateMicrosPerMillion: input.inputRateMicrosPerMillion ?? BigInt(0),
    outputRateMicrosPerMillion: input.outputRateMicrosPerMillion ?? BigInt(0),
    cacheRateMicrosPerMillion: input.cacheRateMicrosPerMillion ?? BigInt(0),
    billingOwner: input.billingOwner ?? null,
    renewalDate: input.renewalDate ?? null,
    externalReference: input.externalReference ?? null,
    notes: input.notes ?? null,
    priceSource: customPrice ? "custom" : "provider_catalog",
    priceVerifiedAt: new Date(`${tool.lastVerifiedAt}T00:00:00.000Z`),
    customPrice,
    providerSourceUrl: tool.sourceUrl,
  };
}

export async function listSubscriptions(orgId: string) {
  const plans = await prisma.billingPlanTemplate.findMany({
    where: { orgId, active: true },
    include: {
      assignments: {
        where: { active: true, seatStatus: "active" },
        select: { seatCount: true },
      },
    },
    orderBy: [{ toolKey: "asc" }, { name: "asc" }],
  });
  return plans.map(({ assignments, ...plan }) => {
    const assignedSeats = assignments.reduce((sum, assignment) => sum + assignment.seatCount, 0);
    return {
      ...plan,
      assignedSeats,
      availableSeats: Math.max(0, plan.seatCapacity - assignedSeats),
      estimatedMonthlyMicros: plan.monthlySeatMicros * BigInt(plan.seatCapacity),
    };
  });
}

export async function activeAssignedSeats(orgId: string, planTemplateId: string) {
  const aggregate = await prisma.developerPlanAssignment.aggregate({
    where: { orgId, planTemplateId, active: true, seatStatus: "active" },
    _sum: { seatCount: true },
  });
  return aggregate._sum.seatCount ?? 0;
}
