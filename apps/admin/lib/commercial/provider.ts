export type EnrollmentDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export interface CommercialFeaturesProvider {
  readonly edition: "community" | "commercial";
  workspaceDefaults(): { plan: string };
  assertCanEnrollDevice(orgId: string): Promise<EnrollmentDecision>;
}

export const commercialFeatures: CommercialFeaturesProvider = {
  edition: "community",
  workspaceDefaults: () => ({ plan: "community" }),
  assertCanEnrollDevice: async () => ({ allowed: true }),
};
