import { Separator } from "@/components/ui/separator";
import { supportedTools } from "@/lib/landing/config";

export function TrustStrip() {
  return (
    <section className="border-y border-border/50 bg-card/30 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Works with the tools your team already uses
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {supportedTools.map((tool) => (
            <div key={tool.name} className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-secondary text-xs font-semibold text-muted-foreground">
                {tool.placeholder}
              </div>
              <span className="text-sm text-muted-foreground">{tool.name}</span>
            </div>
          ))}
        </div>
        <Separator className="mx-auto mt-8 max-w-xs opacity-50" />
      </div>
    </section>
  );
}
