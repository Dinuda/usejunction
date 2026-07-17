import { z } from "zod";

export const activitySettingsInputSchema = z.object({
  teamPeriodControlsEnabled: z.boolean().optional(),
  teamDeviceActivityEnabled: z.boolean().optional(),
});

export type ActivitySettingsInput = z.infer<typeof activitySettingsInputSchema>;

export type OrgActivitySettings = {
  teamPeriodControlsEnabled: boolean;
  teamDeviceActivityEnabled: boolean;
  updatedAt: string | null;
};

export function defaultActivitySettings(): OrgActivitySettings {
  return {
    teamPeriodControlsEnabled: false,
    teamDeviceActivityEnabled: false,
    updatedAt: null,
  };
}
