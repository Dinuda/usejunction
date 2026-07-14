"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { OAuthProviderButtons } from "@/components/auth/oauth-provider-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";
  const verified = searchParams.get("verified") === "1";
  const joiningInvite =
    from.startsWith("/i/") || from.startsWith("/join/") || from.startsWith("/connect-invite/");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false, callbackUrl: from });
    setLoading(false);
    if (result?.error) {
      setError("We could not sign you in. Check your details and verify your email first.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {verified && (
        <Alert>
          <AlertDescription>
            {joiningInvite
              ? "Your email is verified. Sign in to continue with your invite."
              : "Your email is verified. Sign in to open your dashboard."}
          </AlertDescription>
        </Alert>
      )}
      <OAuthProviderButtons callbackUrl={from} showEmailDivider />
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a className="text-xs text-muted-foreground hover:text-primary" href="/forgot-password">
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to UseJunction?{" "}
        <a
          href={`/signup?from=${encodeURIComponent(from)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}
          className="text-foreground underline underline-offset-4"
        >
          Create an account
        </a>
      </p>
    </div>
  );
}
