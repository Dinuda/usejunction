import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = {
  title: "Sign in — UseJunction",
};

export default function LoginPage() {
  return (
    <AuthShell title="Sign in to UseJunction." description="Continue to your workspace, team devices, and AI coding insights.">
      <Suspense><LoginForm /></Suspense>
    </AuthShell>
  );
}
