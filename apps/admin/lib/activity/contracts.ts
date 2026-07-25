import { z } from "zod";

export const activitySettingsInputSchema = z.object({
  teamDeviceActivityEnabled: z.boolean().optional(),
  teamToolsBrowseEnabled: z.boolean().optional(),
});

export type ActivitySettingsInput = z.infer<typeof activitySettingsInputSchema>;

export type OrgActivitySettings = {
  teamDeviceActivityEnabled: boolean;
  teamToolsBrowseEnabled: boolean;
  updatedAt: string | null;
};

export function defaultActivitySettings(): OrgActivitySettings {
  return {
    teamDeviceActivityEnabled: true,
    teamToolsBrowseEnabled: true,
    updatedAt: null,
  };
}
