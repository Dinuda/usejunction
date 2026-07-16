export type SignalsRange = 7 | 30 | 90;

export type SignalsFiltersInput = {
  range?: SignalsRange;
  developerId?: string;
  teamId?: string;
  tool?: string;
};

export type SignalsRecommendedAction = {
  label: string;
  href: string;
};

export type SignalsJourneyRow = {
  flowKey: string;
  flow: string;
  people: number;
  sessions: number;
  medianDurationSeconds: number;
  averageDurationSeconds: number;
  changePercent: number | null;
  lastSeenAt: string | null;
};

export type SignalsToolRow = {
  tool: string;
  sessions: number;
  people: number;
  durationSeconds: number;
  sharePercent: number;
  changePercent: number | null;
};

export type SignalsTrendPoint = {
  weekStart: string;
  sessions: number;
  people: number;
  durationSeconds: number;
};

export function normalizeSignalsRange(value: unknown): SignalsRange {
  const n = Number(value);
  return n === 7 || n === 90 ? n : 30;
}
