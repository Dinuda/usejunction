"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";
import { DashboardMock } from "@/components/public/dashboard-mock";
import { HeroTileBackground } from "@/components/public/hero-tile-background";
import { siteConfig } from "@/lib/public/config";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE },
  },
};

export function HeroSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section
      className="relative overflow-hidden"
      style={{ paddingTop: "14rem", paddingBottom: "7rem", borderBottom: "none" }}
    >
      <HeroTileBackground />

      <div className="public-container relative z-10 w-full">
        <div className="grid gap-10 lg:grid-cols-[38fr_62fr] lg:items-start lg:gap-10 xl:gap-12">
          <motion.div
            className="min-w-0"
            variants={reduceMotion ? undefined : container}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            <motion.h1
              variants={item}
              className="text-[2.5rem] font-bold leading-[1.04] tracking-[-0.025em] sm:text-5xl lg:text-[3.1rem] xl:text-[3.4rem]"
            >
              See every AI coding tool your team uses —{" "}
              <span className="public-headline-emphasis">before you try to control it</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-5 max-w-sm text-base leading-relaxed text-[var(--public-muted)]"
            >
              Models, cost, and device health across your org. Self-hosted and open source.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
              <motion.a
                href={siteConfig.docsUrl}
                className="public-btn public-btn-primary"
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                Deploy UseJunction
                <ArrowRight className="h-4 w-4" />
              </motion.a>
              <motion.a
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="public-btn public-btn-outline"
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                <Github className="h-4 w-4" />
                Star on GitHub
              </motion.a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
            className="relative min-w-0 w-full lg:-mr-2 xl:-mr-4"
          >
            <div
              className="hero-mock-frame relative border"
              style={{ borderColor: "var(--public-border)" }}
            >
              <DashboardMock />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
