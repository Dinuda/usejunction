import type { AppPrincipal } from "@/lib/api/app-auth";
import { jsonSafe } from "@/lib/api/app-response";
import { getOrgSignalsPolicy } from "@/lib/signals/service";

export async function loadSignalsSettingsPage(principal: AppPrincipal) {
  return jsonSafe({ policy: await getOrgSignalsPolicy(principal.orgId) });
}
