import type { SignalsFiltersInput } from "./shared";

export type SignalsActivityInput = SignalsFiltersInput & {
  limit?: number;
};

export type SignalsActivitySession = {
  id: string;
  person: string;
  email: string;
  flowKey: string;
  flow: string;
  durationSeconds: number;
  startedAt: string;
  confidence: number;
};

export type SignalsActivityV1 = {
  windowDays: number;
  filters: {
    developerId: string | null;
    teamId: string | null;
    tool: string | null;
  };
  sessions: SignalsActivitySession[];
};
