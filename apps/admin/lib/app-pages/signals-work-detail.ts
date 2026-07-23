import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { UTC_TIMEZONE } from "@/lib/analytics/contracts/time-window";
import { getWorkSessionDetail } from "@/lib/signals/queries/get-work-session-detail";

export async function loadSignalsWorkDetailPage(principal: AppPrincipal, sessionId: string) {
  const envelope = await getWorkSessionDetail(
    {
      orgId: principal.orgId,
      actorId: principal.userId,
      roles: [principal.role],
      now: new Date(),
      timezone: UTC_TIMEZONE,
    },
    sessionId,
  );
  if (!envelope) return null;
  return jsonSafe({ session: envelope.data });
}
