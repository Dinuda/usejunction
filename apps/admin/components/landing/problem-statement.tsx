import { AlertTriangle } from "lucide-react";

export function ProblemStatement() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          The visibility gap
        </div>
        <h2 className="text-3xl font-bold tracking-tight">
          Your team ships faster with AI — but nobody knows what it costs
        </h2>
        <p className="mt-6 text-lg text-muted-foreground">
          AI coding tools spread across dozens of machines, accounts, and models. Usage is invisible,
          costs are unpredictable, and misconfigurations go unnoticed until something breaks. Engineering
          leaders are flying blind.
        </p>
        <p className="mt-4 text-muted-foreground">
          UseJunction exists because observability shouldn&apos;t be a SaaS upsell. You deserve the same
          visibility into AI tooling that you have for production infrastructure — without sending data
          to yet another vendor.
        </p>
      </div>
    </section>
  );
}
