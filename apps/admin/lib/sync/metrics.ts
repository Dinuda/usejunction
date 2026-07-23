/**
 * Lightweight sync-engine observability helpers.
 * Wire these into your metrics backend (Datadog, OpenTelemetry, etc.).
 */
export type SyncMetricEvent =
  | { name: "sync.run.started"; orgId: string; deviceId: string; expectedRows: number }
  | { name: "sync.run.committed"; orgId: string; deviceId: string; receivedRows: number; durationMs: number }
  | { name: "sync.chunk.retry"; orgId: string; deviceId: string; chunkId: string }
  | { name: "sync.dirty.age_seconds"; orgId: string; value: number }
  | { name: "sync.materialize.duration_ms"; orgId: string; value: number }
  | { name: "sync.overlay.live_days"; orgId: string; value: number }
  | { name: "onboarding.time_to_ready_ms"; orgId: string; value: number };

const listeners: Array<(event: SyncMetricEvent) => void> = [];

export function onSyncMetric(listener: (event: SyncMetricEvent) => void) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emitSyncMetric(event: SyncMetricEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // never throw from metrics
    }
  }
}
