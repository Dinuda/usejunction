"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, Cpu, DollarSign, Gauge, KeyRound, Laptop, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const chapters = [
  {
    id: "see",
    label: "See it",
    description:
      "Track every AI coding tool across developers, devices, and local runtimes in one dashboard.",
    metrics: [
      [Users, "24", "active developers"],
      [Laptop, "33", "devices enrolled"],
      [Cpu, "8", "tools tracked"],
    ],
  },
  {
    id: "understand",
    label: "Understand it",
    description:
      "Attribute tokens, estimated cost, and plan utilization by developer, tool, and model — so seat waste and spikes are obvious.",
    metrics: [
      [DollarSign, "$284.50", "estimated cost / 24h"],
      [Activity, "12,847", "requests / 24h"],
      [Gauge, "1.2s", "average latency"],
    ],
  },
  {
    id: "control",
    label: "Control it",
    description:
      "Surface personal keys, config drift, and health issues so you can introduce shared keys and policy with evidence — not guesswork.",
    metrics: [
      [KeyRound, "3", "personal keys detected"],
      [Gauge, "0.8%", "error rate"],
      [Activity, "14", "open health issues"],
    ],
  },
] as const;

export function ProductWalkthrough() {
  const [activeId, setActiveId] = useState<(typeof chapters)[number]["id"]>("see");
  const reduceMotion = useReducedMotion();
  const active = chapters.find((chapter) => chapter.id === activeId) ?? chapters[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
      <div className="flex flex-col" role="tablist" aria-label="Product capabilities">
        {chapters.map((chapter) => {
          const isActive = chapter.id === activeId;
          return (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`product-panel-${chapter.id}`}
              id={`product-tab-${chapter.id}`}
              onClick={() => setActiveId(chapter.id)}
              className={cn(
                "relative border-b border-border py-5 pl-4 text-left transition-colors first:pt-0",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-primary",
              )}
            >
              {isActive ? (
                <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />
              ) : null}
              <span
                className={cn(
                  "block text-2xl font-semibold tracking-tight sm:text-3xl",
                  isActive && "text-primary",
                )}
              >
                {chapter.label}
              </span>
              <AnimatePresence initial={false}>
                {isActive ? (
                  <motion.p
                    key={`${chapter.id}-desc`}
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden pt-3 text-base leading-7 text-muted-foreground"
                  >
                    {chapter.description}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <div
        id={`product-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`product-tab-${active.id}`}
        className="home-soft-panel min-w-0"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="uj-grid-texture uj-grid-texture-strong bg-primary p-0 text-primary-foreground [--uj-grid-opacity:0.1]"
          >
            <div className="flex items-center justify-between border-b border-primary-foreground/20 px-5 py-3.5">
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.14em]">
                UseJunction / live view
              </span>
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="size-2 bg-brand-yellow" aria-hidden />
                self-hosted
              </span>
            </div>
            <div className="grid sm:grid-cols-3">
              {active.metrics.map(([Icon, value, label]) => (
                <div
                  key={label}
                  className="flex flex-col border-b border-primary-foreground/20 px-5 py-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <Icon className="size-4 opacity-80" aria-hidden />
                  <div className="mt-5 font-mono text-2xl tracking-tight md:text-3xl">{value}</div>
                  <div className="mt-1.5 text-sm text-primary-foreground/75">{label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
