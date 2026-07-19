import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { SignupInviteShell } from "./signup-invite-shell";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInviteShell>
        <SignupForm />
      </SignupInviteShell>
    </Suspense>
  );
}
