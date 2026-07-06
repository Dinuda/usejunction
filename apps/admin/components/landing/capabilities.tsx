import {
  Activity,
  Cpu,
  DollarSign,
  Gauge,
  HardDrive,
  Layers,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const capabilities = [
  {
    icon: Layers,
    title: "Tool visibility",
    description: "See which AI coding tools are installed and active across every developer machine.",
  },
  {
    icon: Users,
    title: "Per-user usage",
    description: "Break down tokens, requests, and cost by developer to understand adoption patterns.",
  },
  {
    icon: Cpu,
    title: "Model tracking",
    description: "Know which models your team reaches for — cloud APIs and local inference alike.",
  },
  {
    icon: DollarSign,
    title: "Cost attribution",
    description: "Estimate spend per user, tool, and model before the invoice arrives.",
  },
  {
    icon: Gauge,
    title: "Latency monitoring",
    description: "Spot slow models and degraded providers before they block your team.",
  },
  {
    icon: HardDrive,
    title: "Local device health",
    description: "Monitor agent status, heartbeats, and configuration across every enrolled device.",
  },
  {
    icon: Activity,
    title: "Request logging",
    description: "Inspect individual requests with model, latency, token count, and error status.",
  },
  {
    icon: Zap,
    title: "Local model usage",
    description: "Track Ollama, LM Studio, and other local inference alongside cloud API calls.",
  },
];

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Full-stack visibility</h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to understand how AI coding tools are used across your organization.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((cap) => (
            <Card key={cap.title} className="border-border/50 bg-card/50 transition-colors hover:border-primary/30">
              <CardHeader className="pb-2">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                  <cap.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{cap.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{cap.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
