"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureFlaticon } from "@/components/public/feature-flaticon";
import { cn } from "@/lib/utils";

export interface FeatureItem {
  title: string;
  description: string;
  metric: string;
  icon: string;
}

interface UjFeaturesProps {
  id?: string;
  label?: string;
  heading: string;
  description?: string;
  features: readonly FeatureItem[];
  className?: string;
}

const COLS_LG = 4;
const EASE = [0.22, 1, 0.36, 1] as const;

function featureCellClass(index: number, total: number) {
  const row = Math.floor(index / COLS_LG);
  const col = index % COLS_LG;
  const rows = Math.ceil(total / COLS_LG);
  const isLast = index === total - 1;

  return cn(
    "group/feature relative flex flex-col overflow-hidden border-0 bg-[var(--public-surface)] py-8 shadow-none sm:py-10",
    !isLast && "border-b border-[var(--public-border)]",
    col === 0 && "lg:border-l lg:border-[var(--public-border)]",
    col < COLS_LG - 1 && "lg:border-r lg:border-[var(--public-border)]",
    row < rows - 1 && "lg:border-b lg:border-[var(--public-border)]",
    isLast && "lg:border-b-0"
  );
}

function FeatureCell({
  feature,
  index,
  total,
}: {
  feature: FeatureItem;
  index: number;
  total: number;
}) {
  const isTopRow = index < COLS_LG;

  return (
    <Card className={featureCellClass(index, total)}>
      {isTopRow ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100"
          style={{
            background:
              "linear-gradient(to top, color-mix(in srgb, var(--public-border) 45%, var(--public-surface)), transparent)",
          }}
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/feature:opacity-100"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--public-border) 45%, var(--public-surface)), transparent)",
          }}
        />
      )}

      <CardContent className="relative z-10 flex flex-col gap-4 p-0 px-6 sm:px-8 lg:px-10">
        <FeatureFlaticon icon={feature.icon} />

        <p className="text-xs public-mono text-[var(--public-accent)] transition-colors duration-200 group-hover/feature:text-[var(--public-fg)]">
          {feature.metric}
        </p>

        <div className="relative min-h-[1.75rem]">
          <div
            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 transition-all duration-200 group-hover/feature:h-8"
            style={{ background: "var(--public-border)" }}
          />
          <div
            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 opacity-0 transition-all duration-200 group-hover/feature:h-8 group-hover/feature:opacity-100"
            style={{ background: "var(--public-accent)" }}
          />
          <h3 className="pl-4 text-base font-semibold leading-snug text-[var(--public-fg)] transition-transform duration-200 group-hover/feature:translate-x-1 sm:text-lg">
            {feature.title}
          </h3>
        </div>

        <p className="max-w-[18rem] text-sm leading-relaxed text-[var(--public-muted)]">
          {feature.description}
        </p>
      </CardContent>
    </Card>
  );
}

export function UjFeatures({
  id,
  label = "What you can see",
  heading,
  description,
  features,
  className,
}: UjFeaturesProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section id={id} className={cn("public-section scroll-mt-20", className)}>
      <div className="container">
        <motion.div
          className="mx-auto mb-12 flex max-w-3xl flex-col items-start gap-4"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          <Badge variant="outline" className="public-eyebrow border-[var(--public-border)] bg-transparent">
            {label}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-[var(--public-fg)] sm:text-4xl">{heading}</h2>
          {description && (
            <p className="text-lg text-[var(--public-muted)]">{description}</p>
          )}
        </motion.div>

        <motion.div
          className="relative z-[1] border border-[var(--public-border)]"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <FeatureCell key={feature.title} feature={feature} index={index} total={features.length} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
