import { WaitlistForm } from "@/components/landing/waitlist-form";

export function CtaBand() {
  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6">
      <div className="landing-glow-accent pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-2xl rounded-2xl border border-primary/20 bg-card/80 p-8 text-center backdrop-blur sm:p-12">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Ready to see what your team is actually using?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Join the waitlist for early access to self-hosted AI coding observability.
        </p>
        <div className="mx-auto mt-8 max-w-md">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
