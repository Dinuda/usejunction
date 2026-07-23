"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import type { PlatformCommands } from "@/lib/connect-command";
import { cn } from "@/lib/utils";

type Platform = keyof PlatformCommands;

function MacIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M3 5.5 10.5 4.2V11H3V5.5zm0 7.5h7.5v5.8L3 17.5V13zm9-8.9L21 2.5v8.4H12V4.6zm0 8.5h9v8.4l-9-1.6V13.1z" />
    </svg>
  );
}

const platformTabs: Array<{
  value: Platform;
  label: string;
  icon: typeof MacIcon;
}> = [
  { value: "macosLinux", label: "macOS / Linux", icon: MacIcon },
  { value: "windows", label: "Windows", icon: WindowsIcon },
];

export function PlatformCommand({
  commands,
  className,
  onCopied,
  footerDescription,
  resolveCommandForCopy,
}: {
  commands: PlatformCommands;
  className?: string;
  onCopied?: () => void;
  footerDescription?: string;
  resolveCommandForCopy?: (platform: Platform) => Promise<string>;
}) {
  const [platform, setPlatform] = useState<Platform>("macosLinux");
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (/Windows/i.test(navigator.userAgent)) setPlatform("windows");
  }, []);

  async function copy() {
    setCopying(true);
    try {
      const text = resolveCommandForCopy
        ? await resolveCommandForCopy(platform)
        : commands[platform];
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1600);
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className={cn("", className)}>
      <div className="inline-flex border border-border bg-muted/30 p-0.5 text-xs" role="tablist" aria-label="Device platform">
        {platformTabs.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={platform === value}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 transition",
              platform === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => { setPlatform(value); setCopied(false); }}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
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
          disabled={copying}
          aria-label={`Copy ${platform === "windows" ? "Windows PowerShell" : "macOS/Linux"} command`}
        >
          {copying ? (
            <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : copied ? (
            <Check className="size-4" />
          ) : (
            <Clipboard className="size-4" />
          )}
        </button>
      </div>
      {footerDescription ? (
        <p className="text-sm leading-7 text-muted-foreground">{footerDescription}</p>
      ) : null}
    </div>
  );
}
