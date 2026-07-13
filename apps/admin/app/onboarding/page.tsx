import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthFrame } from "@/components/auth/auth-shell";
import { OnboardingExperience } from "@/components/onboarding/onboarding-experience";
import { ensureOwnerWorkspace } from "@/lib/ensure-workspace";
import { resolveOrgId } from "@/lib/require-organization";
import { prisma } from "@usejunction/db";

export const metadata = { title: "Set up your workspace" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ resume?: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login?from=/onboarding");

  await ensureOwnerWorkspace({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  const orgId = await resolveOrgId(session.user.id, session.user.orgId);
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

  return (
    <AuthFrame
      eyebrow="Workspace setup"
      title="Let’s get your workspace ready."
      description="Connect one computer or invite your team. You can do the other step whenever you’re ready."
    >
      <OnboardingExperience />
    </AuthFrame>
  );
}
