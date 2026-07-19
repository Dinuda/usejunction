import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell title="Sign in to UseJunction." description="Continue to your workspace, team devices, and AI coding insights.">
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
