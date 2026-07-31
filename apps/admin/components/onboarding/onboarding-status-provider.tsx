"use client";

import { createContext, useContext } from "react";
import type { OnboardingStatus } from "@/components/onboarding/onboarding-experience";

type OnboardingBootstrap = {
  status: OnboardingStatus;
  needsSessionSync: boolean;
};

const OnboardingStatusContext = createContext<OnboardingBootstrap | null>(null);

export function OnboardingStatusProvider({
  status,
  needsSessionSync,
  children,
}: OnboardingBootstrap & { children: React.ReactNode }) {
  return (
    <OnboardingStatusContext value={{ status, needsSessionSync }}>
      {children}
    </OnboardingStatusContext>
  );
}

export function useOnboardingStatus() {
  return useContext(OnboardingStatusContext);
}
