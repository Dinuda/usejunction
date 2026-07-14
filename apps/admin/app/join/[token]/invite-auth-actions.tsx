"use client";

import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Button } from "@/components/ui/button";

export function InviteAuthActions({ token }: { token: string }) {
  const callbackUrl = `/join/${token}`;
  const hasOAuth = getEnabledOAuthProviders().length > 0;

  return (
    <div className="space-y-4">
      <OAuthProviderButtons callbackUrl={callbackUrl} showEmailDivider={hasOAuth} emailDividerLabel="or use email" />
      <div className="space-y-3">
        <Button asChild className="w-full">
          <a href={`/signup?from=${encodeURIComponent(callbackUrl)}`}>Create account</a>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <a href={`/login?from=${encodeURIComponent(callbackUrl)}`}>Sign in</a>
        </Button>
      </div>
    </div>
  );
}
