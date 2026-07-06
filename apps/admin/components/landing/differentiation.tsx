import { Code2, Lock, Server, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const differentiators = [
  {
    icon: Code2,
    title: "Open source",
    description:
      "Full source code on GitHub. Audit it, fork it, contribute back. No black boxes.",
  },
  {
    icon: Server,
    title: "Self-hostable",
    description:
      "Run on your infrastructure — a single VM, Docker Compose, or your existing Kubernetes cluster.",
  },
  {
    icon: Shield,
    title: "Local-first visibility",
    description:
      "The agent runs on developer machines. Metadata stays on your network, not a third-party cloud.",
  },
  {
    icon: Lock,
    title: "No vendor lock-in",
    description:
      "Your data, your deployment, your rules. Switch tools or providers without losing history.",
  },
];

export function Differentiation() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Built different on purpose</h2>
          <p className="mt-3 text-muted-foreground">
            Observability shouldn&apos;t require surrendering your data to another SaaS vendor.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {differentiators.map((item) => (
            <Card key={item.title} className="border-border/50 bg-card/50">
              <CardHeader className="flex-row items-center gap-4 space-y-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
