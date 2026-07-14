import { Suspense } from "react";
import { SignupForm } from "./signup-form";
import { SignupInviteShell } from "./signup-invite-shell";

export const metadata = { title: "Sign up — UseJunction" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInviteShell>
        <SignupForm />
      </SignupInviteShell>
    </Suspense>
  );
}
