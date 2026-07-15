export const machineAuthenticatedRoutes = new Set([
  "/api/enroll",
  "/api/ingest/request",
  "/api/ingest/local-usage",
  "/api/devices/heartbeat",
  "/api/devices/tools",
  "/api/devices/local-models",
  "/api/devices/accounts",
  "/api/devices/quota",
  "/api/otel/v1/metrics",
  "/api/cron/provider-sync",
  "/api/cron/litellm-budget",
  "/api/cron/materialize-metrics",
]);
