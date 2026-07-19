import { LockKeyhole, Server, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { siteConfig } from "@/lib/public/config";

const pillars = [
  {
    Icon: Server,
    title: "Self-hosted",
    description: "Run the control plane on infrastructure your team already trusts.",
  },
  {
    Icon: LockKeyhole,
    title: "Metadata-only",
    description: "Usage, cost, and health by default — not prompts or source code.",
  },
  {
    Icon: ShieldCheck,
    title: "Audit the code",
    description: "MIT-licensed. Read it, fork it, and deploy what you can verify.",
  },
] as const;

export function HomeTrustBand() {
  return (
    <section className="border-b border-border py-16 sm:py-20 lg:py-28">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-5 lg:px-8">
        <div className="overflow-hidden border border-primary/20 bg-primary-pale">
          <div className="grid gap-10 p-8 sm:p-10 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-14 lg:p-12">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
                Open source · self-hosted
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl lg:text-[2.5rem] lg:leading-[1.1]">
                Visibility you can run yourself.
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
                UseJunction is built for teams that want AI coding observability without handing
                prompts or keys to another SaaS silo.
              </p>
              <Link
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="public-btn public-btn-primary mt-8"
              >
                View on GitHub
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {pillars.map(({ Icon, title, description }) => (
                <div key={title} className="border border-primary/25 bg-background/80 p-5">
                  <Icon className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-6 text-sm font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
