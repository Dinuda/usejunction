import { ArrowRight } from "lucide-react";

const steps = [
  {
    step: "01",
    title: "Install the agent",
    description: "Deploy the lightweight local agent on developer machines via a single enrollment token.",
  },
  {
    step: "02",
    title: "Connect your tools",
    description: "The agent hooks into Cursor, Claude Code, Windsurf, and other tools without changing workflows.",
  },
  {
    step: "03",
    title: "Observe usage",
    description: "Request metadata flows to your self-hosted admin — models, tokens, latency, and cost.",
  },
  {
    step: "04",
    title: "Review health",
    description: "Monitor device heartbeats, config drift, and provider incidents from one dashboard.",
  },
  {
    step: "05",
    title: "Act in admin",
    description: "Drill into per-user spend, flag misconfigurations, and make data-driven tooling decisions.",
  },
];

export function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-20 border-y border-border/50 bg-card/20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            From install to insight in five steps — no workflow changes required.
          </p>
        </div>

        <div className="space-y-0">
          {steps.map((item, i) => (
            <div key={item.step} className="relative flex gap-6 pb-10 last:pb-0">
              {i < steps.length - 1 && (
                <div className="absolute left-5 top-12 h-[calc(100%-2rem)] w-px bg-border" />
              )}
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                {item.step}
              </div>
              <div className="flex-1 pt-1.5">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  {item.title}
                  {i < steps.length - 1 && (
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:inline" />
                  )}
                </h3>
                <p className="mt-1 text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
