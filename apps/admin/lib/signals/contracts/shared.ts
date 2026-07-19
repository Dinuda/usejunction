export type SignalsDimensionFilters = {
  developerId?: string;
  teamId?: string;
  tool?: string;
};

export type SignalsFiltersInput = SignalsDimensionFilters & {
  /** Inclusive UTC calendar days. API callers may request 1–366 days. */
  days?: number;
  from?: string;
  to?: string;
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
  /** UTC calendar date (YYYY-MM-DD) for the bucket — day start, or Monday for weekly rollups. */
  date: string;
  sessions: number;
  people: number;
  durationSeconds: number;
};
