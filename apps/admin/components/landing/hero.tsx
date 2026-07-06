import { Github } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { siteConfig } from "@/lib/landing/config";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
      <div className="landing-glow pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-3xl text-center">
        <Badge variant="secondary" className="mb-6 border border-primary/20 bg-primary/10 text-primary">
          Open source · Self-hostable
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Observability for{" "}
          <span className="text-primary">AI coding tools</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          {siteConfig.description}
        </p>

        <div id="hero-waitlist" className="mx-auto mt-10 max-w-md scroll-mt-24">
          <WaitlistForm />
        </div>

        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" asChild>
            <a href={siteConfig.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github />
              View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
