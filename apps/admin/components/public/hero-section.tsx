"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import { DashboardMock } from "@/components/public/dashboard-mock";
import { siteConfig } from "@/lib/public/config";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE },
  },
};

export function HeroSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="hero-atmosphere relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-28 lg:pt-36">
      <div className="hero-atmosphere-dots" aria-hidden />

      <div className="public-container relative z-10 w-full">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 xl:gap-16">
          <motion.div
            className="relative min-w-0"
            variants={reduceMotion ? undefined : container}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            <motion.p
              variants={item}
              className="font-mono text-xs uppercase tracking-[0.16em] text-primary"
            >
              AI coding observability
            </motion.p>

            <motion.h1
              variants={item}
              className="mt-4 text-[2.35rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem]"
            >
              See every AI coding tool.
              <br />
              <span className="public-headline-emphasis">Before you try to control it.</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-6 max-w-md text-base leading-relaxed text-[var(--public-muted)] sm:text-lg sm:leading-8"
            >
              Models, cost, plan utilization, and device health across Cursor, Claude Code,
              Copilot, and more — open-source and self-hosted.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
                <Link href={siteConfig.signupUrl} className="public-btn public-btn-primary w-full sm:w-auto">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
              <motion.a
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="public-btn public-btn-outline w-full sm:w-auto"
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                <Github className="h-4 w-4" />
                Star on GitHub
              </motion.a>
            </motion.div>

            <motion.p variants={item} className="mt-4 text-sm text-[var(--public-muted)]">
              <span className="text-primary">Self-hosted</span>
              {" · "}
              <span className="text-primary">MIT</span>
              {" · no prompts by default"}
            </motion.p>
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: EASE }}
            className="relative min-w-0 w-full"
          >
            <div className="hero-mock-frame max-h-[36rem] overflow-hidden lg:max-h-none">
              <DashboardMock />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
