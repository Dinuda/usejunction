"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import type { PlatformCommands } from "@/lib/connect-command";
import { cn } from "@/lib/utils";

type Platform = keyof PlatformCommands;

export function PlatformCommand({ commands, className }: { commands: PlatformCommands; className?: string }) {
  const [platform, setPlatform] = useState<Platform>("macosLinux");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setPlatform("windows");
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(commands[platform]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="inline-flex border border-border bg-muted/30 p-0.5 text-xs" role="tablist" aria-label="Device platform">
        {(["macosLinux", "windows"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={platform === value}
            className={cn(
              "px-3 py-1.5 transition",
              platform === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => { setPlatform(value); setCopied(false); }}
          >
            {value === "windows" ? "Windows" : "macOS / Linux"}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden border border-brand-olive bg-brand-olive p-4 pr-14 font-mono text-xs leading-6 text-primary-foreground">
        <code className="break-all">{commands[platform]}</code>
        <button
          type="button"
          className={cn(
            "absolute right-2 top-2 flex size-11 items-center justify-center border border-brand-olive-border p-0 text-primary-foreground/80 transition hover:bg-brand-olive-secondary sm:right-3 sm:top-3 sm:size-9",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => void copy()}
          aria-label={`Copy ${platform === "windows" ? "Windows PowerShell" : "macOS/Linux"} command`}
        >
          {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
        </button>
      </div>
      <p className="font-mono text-[0.65rem] text-muted-foreground">
        {copied ? "Copied" : platform === "windows" ? "Paste in PowerShell" : "Paste in Terminal"}
      </p>
    </div>
  );
}
