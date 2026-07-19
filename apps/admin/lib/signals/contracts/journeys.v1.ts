import type { SignalsFiltersInput, SignalsJourneyRow } from "./shared";

export type SignalsJourneysInput = SignalsFiltersInput;

export type SignalsJourneysV1 = {
  windowDays: number;
  filters: {
    developerId: string | null;
    teamId: string | null;
    tool: string | null;
  };
  journeys: SignalsJourneyRow[];
};
