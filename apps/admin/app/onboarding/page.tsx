import { OnboardingExperience } from "@/components/onboarding/onboarding-experience";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  return <OnboardingExperience soloMode={params.mode === "solo"} />;
}
