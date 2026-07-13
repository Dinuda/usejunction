"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function InviteAuthActions({ token }: { token: string }) {
  const callbackUrl = `/join/${token}`;
  const providers = [
    { id: "google", label: "Google", enabled: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true" },
    { id: "microsoft-entra-id", label: "Microsoft", enabled: process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === "true" },
    { id: "github", label: "GitHub", enabled: process.env.NEXT_PUBLIC_GITHUB_AUTH_ENABLED === "true" },
  ].filter((provider) => provider.enabled);
  return <div className="space-y-3">{providers.map((provider) => <Button key={provider.id} type="button" variant="outline" className="w-full" onClick={() => signIn(provider.id, { callbackUrl })}>Continue with {provider.label}</Button>)}<Button asChild className="w-full"><a href={`/login?from=${encodeURIComponent(callbackUrl)}`}>{providers.length ? "Use work email instead" : "Sign in to continue"}</a></Button></div>;
}
