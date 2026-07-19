import type {
  SignalsFiltersInput,
  SignalsJourneyRow,
  SignalsRecommendedAction,
  SignalsToolRow,
  SignalsTrendPoint,
} from "./shared";

export type SignalsOverviewInput = SignalsFiltersInput;

export type SignalsOverviewV1 = {
  windowDays: number;
  policyEnabled: boolean;
  insight: string;
  recommendedAction: SignalsRecommendedAction | null;
  kpis: {
    sessions: { value: number; previousValue: number; changePercent: number | null };
    activePeople: { value: number; previousValue: number; changePercent: number | null };
    timeAroundAiSeconds: { value: number; previousValue: number; changePercent: number | null };
    topJourney: { flowKey: string | null; flow: string | null; sessions: number };
  };
  trend: SignalsTrendPoint[];
  topJourneys: SignalsJourneyRow[];
  topTools: SignalsToolRow[];
};
