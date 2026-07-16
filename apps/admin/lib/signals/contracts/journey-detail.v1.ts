import type { SignalsFiltersInput, SignalsRange } from "./shared";

export type SignalsJourneyDetailInput = SignalsFiltersInput & {
  flowKey: string;
};

export type SignalsJourneyStep = {
  label: string;
  medianSeconds: number;
};

export type SignalsJourneyDetailV1 = {
  range: SignalsRange;
  flowKey: string;
  flow: string;
  people: number;
  sessions: number;
  medianDurationSeconds: number;
  changePercent: number | null;
  steps: SignalsJourneyStep[];
};
