import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveOrgId } from "@/lib/require-organization";
import { safeAuthReturnPath } from "@/lib/auth/oauth-account-conflict";
import { prisma } from "@usejunction/db";

/**
 * Post-auth landing: send first-time / incomplete users straight to onboarding
 * without flashing /dashboard.
 */
export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const from = safeAuthReturnPath(params.from);

  const orgId = await resolveOrgId(session.user.id, session.user.orgId);
  if (!orgId) {
    redirect("/onboarding");
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { userId_orgId: { userId: session.user.id, orgId } },
    select: { onboardingCompletedAt: true },
  });

  if (!membership?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  redirect(from === "/onboarding" ? "/dashboard" : from);
}
