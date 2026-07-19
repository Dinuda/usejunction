import { Activity, KeyRound, Laptop, Users } from "lucide-react";
import { ClaudeCode, Cursor, GithubCopilot, Ollama } from "@/lib/tool-icons";

const deepDives = [
  {
    title: "See your AI coding stack in one place.",
    description:
      "Connect devices in minutes. Break down adoption by developer, tool, and local runtime — no spreadsheets.",
    mock: (
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-primary">Coverage</span>
          <span className="inline-flex items-center gap-1.5 text-primary">
            <Users className="size-3.5" />
            24 active
          </span>
        </div>
        {(
          [
            [Cursor, "Cursor", "18 seats", "14 active"],
            [ClaudeCode, "Claude Code", "12 seats", "9 active"],
            [GithubCopilot, "Copilot", "20 seats", "11 active"],
            [Ollama, "Ollama", "local", "6 runtimes"],
          ] as const
        ).map(([Icon, name, seats, status]) => (
          <div
            key={name}
            className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon size={18} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{seats}</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-primary">{status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Translate tokens into spend you can explain.",
    description:
      "Attribute estimated cost and plan utilization by developer, model, and day so finance and eng share one picture.",
    mock: (
      <div className="p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-primary">
              Est. cost / 24h
            </p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-tight">$284.50</p>
          </div>
          <div className="flex h-16 items-end gap-1">
            {[40, 55, 48, 72, 64, 88, 76].map((h, i) => (
              <span
                key={i}
                className="w-3 rounded-sm bg-primary/20 first:bg-primary/40 last:bg-primary"
                style={{ height: `${h}%` }}
                aria-hidden
              />
            ))}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div>
            <dt className="text-xs text-muted-foreground">Requests</dt>
            <dd className="mt-1 font-mono text-sm font-medium">12,847</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Top model</dt>
            <dd className="mt-1 font-mono text-sm font-medium">claude-sonnet-4</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Seat waste signal</dt>
            <dd className="mt-1 font-mono text-sm font-medium text-primary">6 idle seats</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Avg latency</dt>
            <dd className="mt-1 font-mono text-sm font-medium">1.2s</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    title: "Catch surprises before they become incidents.",
    description:
      "Flag personal keys and error spikes from the same surface — then prepare shared keys and policy deliberately.",
    mock: (
      <div className="space-y-3 p-5">
        <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-wider text-primary">
          <Activity className="size-3.5" />
          Health
        </div>
        {(
          [
            [KeyRound, "Personal key detected", "morgan@acme.dev", "warning"],
            [Laptop, "Device stale 4d", "build-mac-12", "muted"],
            [Activity, "Error rate up", "gpt-4o · +0.4pp", "warning"],
          ] as const
        ).map(([Icon, title, detail, tone]) => (
          <div
            key={title}
            className="flex items-start gap-3 border border-border bg-muted/40 px-3 py-3"
          >
            <Icon
              className={tone === "warning" ? "mt-0.5 size-4 text-brand-orange" : "mt-0.5 size-4 text-muted-foreground"}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
] as const;

export function HomeFeatureDeepDives() {
  return (
    <section id="features" className="scroll-mt-20 border-b border-border py-16 sm:py-20 lg:py-32">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Features</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]">
            Turn AI coding data into decisions you can act on.
          </h2>
          <p className="mt-5 text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
            Coverage, spend, and health on one operating surface — before you rewrite workflows or
            introduce control.
          </p>
        </div>

        <div className="mt-12 space-y-16 lg:mt-16 lg:space-y-24">
          {deepDives.map((dive, index) => (
            <div
              key={dive.title}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              <div className={index % 2 === 1 ? "lg:order-2" : undefined}>
                <span className="font-mono text-xs text-primary">0{index + 1}</span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-[1.75rem] md:leading-tight">
                  {dive.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
                  {dive.description}
                </p>
              </div>
              <div
                className={
                  index % 2 === 1
                    ? "home-soft-panel border-primary/20 lg:order-1"
                    : "home-soft-panel border-primary/20"
                }
              >
                {dive.mock}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
