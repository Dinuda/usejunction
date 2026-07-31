/**
 * Agent/dashboard contract version. Kept dependency-free because heartbeat
 * only needs this value and must not pull the Ably-backed sync service into
 * its route bundle.
 */
export const REMOTE_SYNC_PROTOCOL = 1;
