"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo } from "@/components/brand-logo";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); if (!response.ok) { setError("Unable to send your note right now."); return; } setSent(true); }
  return <div className="min-h-svh bg-muted px-5 py-16"><div className="mx-auto w-full max-w-xl"><a href="/" className="flex items-center" aria-label="UseJunction home"><BrandLogo className="h-10" /></a><div className="mt-20"><p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">Enterprise conversation</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">Tell us what your team needs.</h1><p className="mt-4 leading-7 text-muted-foreground">We’ll follow up about deployment, retention, and planned enterprise capabilities.</p>{sent ? <Alert className="mt-8"><AlertDescription>Thanks—your note has been received.</AlertDescription></Alert> : <form onSubmit={submit} className="mt-8 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div></div><div className="space-y-2"><Label htmlFor="company">Company</Label><Input id="company" name="company" /></div><div className="space-y-2"><Label htmlFor="message">What are you evaluating?</Label><Textarea id="message" name="message" rows={5} /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Button>Send note</Button></form>}</div></div></div>;
}
