"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell title="Reset your password." description="Enter your email and we’ll send a reset link if an account exists.">
    {sent ? <Alert><AlertDescription>Check your email for next steps. If you don’t see it, check your spam folder.</AlertDescription></Alert> : <form onSubmit={submit} className="space-y-4" aria-busy={loading}><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@company.com" /></div><Button className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button></form>}
    <a href="/login" className="mt-6 block text-center text-sm text-muted-foreground !underline underline-offset-4">Back to sign in</a>
  </AuthShell>;
}
