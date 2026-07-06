"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Install the admin app",
    description:
      "Deploy the self-hostable UseJunction admin on your infrastructure — Docker Compose, a single VM, or your existing cluster. Your data stays on your network.",
  },
  {
    number: "02",
    title: "Roll out the local agent",
    description:
      "Developers enroll devices with a single token. The lightweight agent runs locally and reports metadata — no workflow changes required.",
  },
  {
    number: "03",
    title: "Configure supported tools",
    description:
      "Point Cursor, Claude Code, Continue, and other supported tools at the agent. Observation only — no traffic interception.",
  },
  {
    number: "04",
    title: "See usage in the dashboard",
    description:
      "Cost, models, latency, device health, and key usage appear in one org-wide view. Visibility before control.",
  },
];

export function HowItWorksSequence() {
  const [visibleCount, setVisibleCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            let step = 0;
            const reveal = () => {
              step++;
              setVisibleCount(step);
              if (step < STEPS.length) setTimeout(reveal, 400);
            };
            reveal();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="mt-12 space-y-0">
      {STEPS.map((step, i) => {
        const visible = i < visibleCount;
        return (
          <div key={step.number}>
            <div
              className="grid gap-6 border-t py-10 lg:grid-cols-12 lg:gap-8"
              style={{
                borderColor: "var(--public-border)",
                opacity: visible ? 1 : 0.3,
                transition: "opacity 0.4s ease",
              }}
            >
              <div className="lg:col-span-1">
                <span className="public-mono text-sm text-muted-foreground">{step.number}</span>
              </div>
              <div className="lg:col-span-4">
                <h3 className="text-lg font-semibold">{step.title}</h3>
              </div>
              <div className="lg:col-span-7">
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex justify-center py-1" style={{ opacity: visible ? 1 : 0.2 }}>
                <ArrowDown className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
