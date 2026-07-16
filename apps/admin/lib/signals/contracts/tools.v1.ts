import type { SignalsFiltersInput, SignalsRange, SignalsToolRow } from "./shared";

export type SignalsToolsInput = SignalsFiltersInput;

export type SignalsToolsV1 = {
  range: SignalsRange;
  filters: {
    developerId: string | null;
    teamId: string | null;
    tool: string | null;
  };
  tools: SignalsToolRow[];
};
