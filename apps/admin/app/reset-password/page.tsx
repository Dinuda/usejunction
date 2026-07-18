"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth/auth-shell";
import { userFacingError } from "@/lib/errors/user-facing";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setLoading(true); try { const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password, confirmPassword }) }); const data = await response.json().catch(() => ({})); if (!response.ok) { setError(userFacingError(data.error, "Unable to update your password.")); return; } setDone(true); } finally { setLoading(false); } }
  if (done) return <Alert><AlertDescription>Password updated. <a href="/login" className="underline">Sign in</a>.</AlertDescription></Alert>;
  return <form onSubmit={submit} className="space-y-4" aria-busy={loading}><div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /><p id="password-hint" className="text-xs text-muted-foreground">Use at least 12 characters.</p></div><div className="space-y-2"><Label htmlFor="confirmPassword">Confirm password</Label><Input id="confirmPassword" type="password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="new-password" /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button className="w-full" disabled={loading}>{loading ? "Updating…" : "Update password"}</Button></form>;
}

export default function ResetPasswordPage() { return <AuthShell title="Choose a new password." description="Use a new password to keep your workspace secure."><Suspense><ResetForm /></Suspense></AuthShell>; }
