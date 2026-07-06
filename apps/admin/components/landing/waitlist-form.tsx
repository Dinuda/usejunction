"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitWaitlist } from "@/lib/landing/waitlist";
import { cn } from "@/lib/utils";

type FormState = "idle" | "loading" | "success" | "error";

interface WaitlistFormProps {
  className?: string;
  compact?: boolean;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function WaitlistForm({ className, compact }: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      setState("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setState("loading");
    setErrorMessage("");

    const result = await submitWaitlist(email);

    if (result.ok) {
      setState("success");
      setEmail("");
    } else {
      setState("error");
      setErrorMessage(result.error);
    }
  }

  if (state === "success") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3",
          className
        )}
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        <p className="text-sm text-emerald-300">
          You&apos;re on the list. We&apos;ll reach out when early access opens.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-3", className)}>
      <div className={cn("flex gap-2", compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row")}>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          disabled={state === "loading"}
          aria-label="Email address"
          className="flex-1 bg-card/50"
        />
        <Button type="submit" disabled={state === "loading"} className="shrink-0">
          {state === "loading" ? (
            <>
              <Loader2 className="animate-spin" />
              Joining…
            </>
          ) : (
            "Join waitlist"
          )}
        </Button>
      </div>
      {state === "error" && errorMessage && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}
    </form>
  );
}
