"use client";

import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";

export function SignupInviteShell({ children }: { children: React.ReactNode }) {
  const params = useSearchParams();
  const from = params.get("from") || "";
  const joiningInvite =
    from.startsWith("/i/") || from.startsWith("/join/") || from.startsWith("/connect-invite/");
  const hasOAuth = getEnabledOAuthProviders().length > 0;

  if (joiningInvite) {
    return (
      <AuthShell
        accent="yellow"
        title="Create your account."
        description={
          hasOAuth
            ? "Continue with Google or GitHub, or sign up with your work email, to accept the invite and install UseJunction on your machine."
            : "Sign up with your work email to accept the invite and install UseJunction on your machine."
        }
      >
        {children}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      accent="yellow"
      title="Create your workspace."
      description="Start with a shared workspace for your team's AI coding tools, spend, and device health. You can add more workspaces later when you need them."
    >
      {children}
    </AuthShell>
  );
}
