import { listSubscriptions } from "@/lib/tools/subscriptions";

export async function readSubscriptions(orgId: string) {
  return listSubscriptions(orgId);
}
