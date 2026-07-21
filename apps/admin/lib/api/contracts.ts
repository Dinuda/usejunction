import { z } from "zod";

export const appApiMetaSchema = z.object({
  generatedAt: z.iso.datetime(),
  requestId: z.string().min(1),
});

export const appApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  meta: appApiMetaSchema,
});

export const appApiSuccessSchema = z.object({
  data: z.unknown(),
  meta: appApiMetaSchema,
});

export const memberSectionSchema = z.enum(["overview", "coding", "fleet", "work"]);
