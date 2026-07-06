import { siteConfig } from "@/lib/landing/config";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
          UJ
        </div>
        <span className="text-lg font-semibold tracking-tight">{siteConfig.name}</span>
      </div>
    </div>
  );
}
