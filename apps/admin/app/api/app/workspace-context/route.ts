import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { appData, appError, timingHeader } from "@/lib/api/app-response";
import { loadWorkspaceContextPage } from "@/lib/app-pages/workspace-context";

export async function GET(_request: NextRequest) {
  const started = performance.now();
  const session = await auth();
  const sessionDecoded = performance.now();
  if (!session?.user?.id) {
    return appError("UNAUTHENTICATED", "Your session has expired.", 401);
  }

  const membershipsStarted = performance.now();
  const data = await loadWorkspaceContextPage(session.user.id, session.user.orgId);
  const prepared = performance.now();

  return appData(data, {
    serverTiming: timingHeader({
      session: sessionDecoded - started,
      membership: membershipsStarted - sessionDecoded,
      data: prepared - membershipsStarted,
      total: prepared - started,
    }),
  });
}
