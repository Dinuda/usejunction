import { z } from "zod";
import { dateOnlyInput, microsInput } from "@/lib/billing/validation";

export const apiCreditPoolInputSchema = z.object({
  connectionId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["recurring", "fixed"]),
  budgetMicros: microsInput,
  billingCadence: z.enum(["weekly", "monthly", "annual", "custom"]).optional().nullable(),
  billingCycleAnchorDate: dateOnlyInput.optional().nullable(),
  billingCycleDays: z.number().int().positive().max(3660).optional().nullable(),
  grantStartDate: dateOnlyInput.optional().nullable(),
  expiresAt: dateOnlyInput.optional().nullable(),
}).superRefine((value, context) => {
  if (value.budgetMicros <= BigInt(0)) context.addIssue({ code: "custom", path: ["budgetMicros"], message: "budget must be positive" });
  if (value.mode === "recurring") {
    if (!value.billingCadence) context.addIssue({ code: "custom", path: ["billingCadence"], message: "cadence is required" });
    if (value.billingCadence === "custom" && !value.billingCycleDays) context.addIssue({ code: "custom", path: ["billingCycleDays"], message: "custom cadence requires days" });
  }
  if (value.mode === "fixed") {
    if (!value.grantStartDate) context.addIssue({ code: "custom", path: ["grantStartDate"], message: "grant start is required" });
    if (value.expiresAt && value.grantStartDate && value.expiresAt <= value.grantStartDate) context.addIssue({ code: "custom", path: ["expiresAt"], message: "expiry must be after grant start" });
  }
});

export const apiCreditPoolUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  budgetMicros: microsInput.optional(),
  billingCadence: z.enum(["weekly", "monthly", "annual", "custom"]).optional().nullable(),
  billingCycleAnchorDate: dateOnlyInput.optional().nullable(),
  billingCycleDays: z.number().int().positive().max(3660).optional().nullable(),
  grantStartDate: dateOnlyInput.optional().nullable(),
  expiresAt: dateOnlyInput.optional().nullable(),
  active: z.boolean().optional(),
});

export const creditUsageGroupSchema = z.enum(["developer", "api_key", "project", "model"]);
