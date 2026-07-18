export type DeviceActivityInspect = {
  requestSummary: unknown;
  responseSummary: unknown;
};

export type DeviceActivityDevice = {
  id: string;
  hostname: string;
  os: string;
  architecture: string;
  agentVersion: string;
  online: boolean;
};

export type DeviceActivityDeveloper = {
  id: string;
  name: string;
  email: string;
} | null;

export type DeviceActivityItem = {
  id: string;
  kind: string;
  source: "exchange" | "observed" | "presence";
  direction: string;
  status: string;
  at: string;
  title: string;
  summary: string;
  errorCode: string | null;
  durationMs: number | null;
  device: DeviceActivityDevice;
  developer: DeviceActivityDeveloper;
  details: Record<string, unknown>;
  inspect: DeviceActivityInspect;
};

export type DeviceActivityFeed = {
  items: DeviceActivityItem[];
  presenceFallback: boolean;
};
