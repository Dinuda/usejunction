import type { SignalsFiltersInput, SignalsJourneyRow, SignalsRange } from "./shared";

export type SignalsJourneysInput = SignalsFiltersInput;

export type SignalsJourneysV1 = {
  range: SignalsRange;
  filters: {
    developerId: string | null;
    teamId: string | null;
    tool: string | null;
  };
  journeys: SignalsJourneyRow[];
};
