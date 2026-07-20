"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { siteConfig } from "@/lib/public/config";

/** Display aspect for the hero Lottie (width / height). */
const LOTTIE_AR = 850 / 950;

function HeroLottie({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ ["--ar" as string]: LOTTIE_AR }}
      data-asset-width="850"
      data-asset-height="950"
    >
      <div
        className="w-full"
        style={{ aspectRatio: "var(--ar)" }}
        role="img"
        aria-label="UseJunction AI coding observability overview"
      >
        <DotLottieReact
          src="/animations/hero.lottie"
          autoplay={!reduceMotion}
          loop
          renderConfig={{ autoResize: true }}
          className="h-full w-full"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

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
    <section className="hero-atmosphere relative overflow-x-clip bg-white">
      <div className="relative z-10 mx-auto flex w-full max-w-screen-2xl items-center px-4 md:px-8 lg:px-10 xl:px-12">
        <div className="grid w-full min-h-[80svh] grid-cols-1 items-center gap-10 pt-30 pt-24 md:gap-12 md:pt-24 md:pt-28 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-6 lg:pt-16 lg:pt-20">
          <motion.div
            className="relative isolate flex min-w-0 flex-col items-center text-center lg:max-w-lg lg:items-start lg:justify-center lg:text-left xl:max-w-xl"
            variants={reduceMotion ? undefined : container}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
          >
            <motion.p variants={item} className="text-sm font-medium text-[#5c5e56]">
            AI Spend Management
            </motion.p>

            <motion.h1
              variants={item}
              className="mt-4 max-w-xl text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--public-fg)] sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem]"
            >
              See how your team uses AI.
              <br />
              <span className="font-semibold text-[#08a8c4]">Scale what works.</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-3 max-w-md text-base italic leading-relaxed text-[#6b6d66] sm:text-lg sm:leading-8"
            >
              Track usage, spend, and what works—across every AI coding tool.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex w-full flex-col items-center lg:items-start">
              <motion.div
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                className="inline-flex"
              >
                <Link
                  href={siteConfig.signupUrl}
                  className="public-btn public-btn-teal rounded-none px-8 py-3 text-base font-semibold"
                >
                  Get started for free
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </motion.div>
              <p className="mt-3 text-sm text-[#5c5e56]">
                Open source · Your infrastructure · Your data
              </p>
            </motion.div>

            {/* Mobile: animation below CTA */}
            <motion.div
              variants={item}
              className="mt-10 w-full max-w-[min(100%,340px)] lg:hidden"
              aria-hidden
            >
              <HeroLottie reduceMotion={reduceMotion === true} />
            </motion.div>
          </motion.div>

          {/* Desktop: animation beside copy */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="relative hidden items-center justify-center lg:flex lg:justify-end lg:self-center"
            aria-hidden
          >
            <div className="relative w-full max-w-[min(48vw,calc(72svh*0.9),720px)]">
              <HeroLottie reduceMotion={reduceMotion === true} />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
