import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OnboardingExperience } from "@/components/onboarding/onboarding-experience";
import { createWorkspace } from "@/lib/ensure-workspace";
import { resolveOrgId } from "@/lib/require-organization";
import { prisma } from "@usejunction/db";

export const metadata = { title: "Set up your workspace — UseJunction" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login?from=/onboarding");

  let orgId = await resolveOrgId(session.user.id, session.user.orgId);

  // Only create a personal workspace when the user has no memberships.
  // Invitees already belong to the invited org — don't invent another one.
  if (!orgId) {
    const anyMembership = await prisma.organizationMembership.findFirst({
      where: { userId: session.user.id },
      select: { orgId: true },
      orderBy: { createdAt: "desc" },
    });
    if (anyMembership) {
      orgId = anyMembership.orgId;
    } else {
      const created = await createWorkspace({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      });
      orgId = created.orgId;
    }
  }

  const membership = orgId
    ? await prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: session.user.id, orgId } },
        select: { role: true, onboardingCompletedAt: true },
      })
    : null;
  const { resume } = await searchParams;
  if (membership?.onboardingCompletedAt && resume !== "1") {
    redirect("/dashboard");
  }

  return <OnboardingExperience />;
}
