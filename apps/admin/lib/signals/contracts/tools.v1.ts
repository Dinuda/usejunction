import type { SignalsFiltersInput, SignalsToolRow } from "./shared";

export type SignalsToolsInput = SignalsFiltersInput;

export type SignalsToolsV1 = {
  windowDays: number;
  filters: {
    developerId: string | null;
    teamId: string | null;
    tool: string | null;
  };
  tools: SignalsToolRow[];
};
