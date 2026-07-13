"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/dashboard";
  const verified = searchParams.get("verified") === "1";
  const [email, setEmail] = useState("");
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

  async function signInWithProvider(provider: "github" | "google" | "microsoft-entra-id") {
    await signIn(provider, { callbackUrl: from });
  }

  const identityProviders = [
    { id: "google" as const, label: "Google", enabled: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" },
    { id: "microsoft-entra-id" as const, label: "Microsoft", enabled: process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === "true" },
    { id: "github" as const, label: "GitHub", enabled: process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true" },
  ].filter((provider) => provider.enabled);

  return (
    <div className="space-y-5">
      {verified && <Alert><AlertDescription>Your email is verified. Sign in to open your dashboard.</AlertDescription></Alert>}
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@company.com" /></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><a className="text-xs text-muted-foreground hover:text-primary" href="/forgot-password">Forgot password?</a></div><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
      </form>
      {identityProviders.length > 0 && <><div className="flex items-center gap-3"><Separator className="flex-1" /><span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">or</span><Separator className="flex-1" /></div><div className="grid gap-2">{identityProviders.map((provider) => <Button key={provider.id} type="button" variant="outline" className="w-full" onClick={() => signInWithProvider(provider.id)}>Continue with {provider.label}</Button>)}</div></>}
      <p className="text-center text-sm text-muted-foreground">New to UseJunction? <a href="/signup" className="text-foreground underline underline-offset-4">Create an account</a></p>
    </div>
  );
}
