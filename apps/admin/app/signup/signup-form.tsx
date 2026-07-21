"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OAuthProviderButtons, getEnabledOAuthProviders } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userFacingError } from "@/lib/errors/user-facing";

export function SignupForm() {
  const params = useSearchParams();
  const intent = params.get("intent") === "team" ? "team" : "community";
  const from = params.get("from") || "/onboarding";
  const oauthCallbackUrl =
    from === "/dashboard" || from === "/" || from === "/onboarding"
      ? "/onboarding"
      : from;
  const emailPrefill = params.get("email") ?? "";
  const joiningInvite =
    from.startsWith("/i/") || from.startsWith("/join/") || from.startsWith("/connect-invite/");
  const hasOAuth = getEnabledOAuthProviders().length > 0;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailPrefill);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword, intent, from }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(userFacingError(data.error, "Unable to create your account."));
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Alert>
        <AlertDescription>
          {joiningInvite
            ? "Check your email for a verification link. After verifying, sign in — you'll return to your invite to install UseJunction."
            : "Check your email for a verification link. Once verified, sign in to open your dashboard."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {joiningInvite && (
        <Alert>
          <AlertDescription>
            {hasOAuth
              ? "Continue with Google or GitHub, or create an account with your work email. After signup you'll return to the invite to install UseJunction."
              : "Create an account with your work email. After signup you'll return to the invite to install UseJunction."}
          </AlertDescription>
        </Alert>
      )}
      <OAuthProviderButtons callbackUrl={oauthCallbackUrl} showEmailDivider />
      <form onSubmit={submit} className="space-y-4" aria-busy={loading}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            minLength={12}
            aria-describedby="password-hint"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 12 characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={12}
            autoComplete="new-password"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : joiningInvite ? "Create account & continue" : "Create account"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <a
          href={`/login?from=${encodeURIComponent(from)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}
          className="text-foreground underline underline-offset-4"
        >
          Sign in
        </a>
      </p>
    </div>
  );
}
