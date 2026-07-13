import { Suspense } from "react";
import { SignupForm } from "./signup-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Sign up — UseJunction" };

export default function SignupPage() {
  return (
    <AuthShell accent="yellow" eyebrow="Get started" title="Create your workspace." description="Start with a shared workspace for your team&apos;s AI coding tools, spend, and device health. You can add more workspaces later when you need them.">
      <Suspense><SignupForm /></Suspense>
    </AuthShell>
  );
}
