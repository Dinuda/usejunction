"use client";

import { Activity, Cpu, DollarSign, Gauge, KeyRound, Laptop, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const chapters = [
  {
    id: "observe",
    label: "Observe",
    eyebrow: "01 / Coverage",
    title: "See what your team actually uses.",
    description:
      "UseJunction joins device signals, tool installations, local runtimes, and gateway requests into one organization-wide view.",
    metrics: [
      [Users, "24", "active developers"],
      [Laptop, "31/33", "devices online"],
      [Cpu, "8", "tools tracked"],
    ],
  },
  {
    id: "attribute",
    label: "Attribute",
    eyebrow: "02 / Spend",
    title: "Put model spend in context.",
    description:
      "Compare requests, tokens, and estimated cost by developer, tool, model, and day without asking every team to export their own numbers.",
    metrics: [
      [DollarSign, "$284.50", "estimated cost / 24h"],
      [Activity, "12,847", "requests / 24h"],
      [Gauge, "1.2s", "average latency"],
    ],
  },
  {
    id: "diagnose",
    label: "Diagnose",
    eyebrow: "03 / Health",
    title: "Find the gaps before they become incidents.",
    description:
      "Spot error spikes, stale devices, personal keys, missing configuration, and quota pressure from the same operational surface.",
    metrics: [
      [Gauge, "0.8%", "error rate"],
      [KeyRound, "3", "personal keys detected"],
      [Activity, "14", "open health issues"],
    ],
  },
  {
    id: "prepare",
    label: "Prepare",
    eyebrow: "04 / Control",
    title: "Build the foundation for better decisions.",
    description:
      "Once the organization can see adoption and performance, it has the context to introduce shared keys, local models, policy, and routing deliberately.",
    metrics: [
      [Cpu, "12", "local runtimes"],
      [Users, "4", "teams ready to enroll"],
      [Gauge, "30d", "history available"],
    ],
  },
] as const;

export function ProductWalkthrough() {
  return (
    <Tabs defaultValue="observe" orientation="vertical" className="grid gap-6 lg:grid-cols-[12.5rem_1fr] lg:gap-8">
      <TabsList className="h-fit w-full flex-col items-stretch justify-start bg-transparent p-0">
        {chapters.map((chapter) => (
          <TabsTrigger
            key={chapter.id}
            value={chapter.id}
            className="justify-between border-b px-0 py-3.5 text-left text-sm text-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <span className="flex items-center gap-2.5">
              <span className="font-mono text-xs">{chapter.eyebrow.slice(0, 2)}</span>
              {chapter.label}
            </span>
            <span aria-hidden>→</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="min-w-0">
        {chapters.map((chapter) => (
          <TabsContent key={chapter.id} value={chapter.id} className="mt-0">
            <div className="grid gap-6 border border-border bg-card p-5 md:p-6 lg:grid-cols-2 lg:items-stretch lg:gap-8 lg:p-7">
              <div className="flex flex-col justify-center">
                <Badge variant="outline" className="w-fit font-mono text-[0.65rem] uppercase tracking-[0.14em]">
                  {chapter.eyebrow}
                </Badge>
                <h3 className="mt-4 max-w-md text-2xl font-semibold tracking-tight md:text-[1.75rem] md:leading-tight">
                  {chapter.title}
                </h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                  {chapter.description}
                </p>
              </div>

              <Card className="uj-grid-texture uj-grid-texture-strong h-full border-primary-dark bg-primary p-0 text-primary-foreground shadow-none [--uj-grid-opacity:0.1]">
                <CardHeader className="border-b border-primary-foreground/20 px-4 py-3">
                  <CardTitle className="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.14em]">
                    UseJunction / live view
                    <span className="inline-flex items-center gap-2 font-sans text-xs normal-case tracking-normal">
                      <span className="size-2 bg-brand-yellow" aria-hidden />
                      self-hosted
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid h-full gap-0 p-0 sm:grid-cols-3">
                  {chapter.metrics.map(([Icon, value, label]) => (
                    <div
                      key={label}
                      className="flex flex-col border-b border-primary-foreground/20 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                    >
                      <Icon className="size-4 opacity-80" aria-hidden />
                      <div className="mt-4 font-mono text-xl tracking-tight md:text-2xl">{value}</div>
                      <div className="mt-1 text-xs text-primary-foreground/75 md:text-sm">{label}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
