"use client";

import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/public/config";
import { ensureDotLottieWasm } from "@/lib/public/dotlottie";

/** Display aspect for the hero Lottie (width / height). */
const LOTTIE_AR = 850 / 950;
const HERO_LOTTIE_SRC = "/animations/hero.lottie";
const HERO_POSTER_SRC = "/animations/hero.gif";

ensureDotLottieWasm();

function HeroLottie({ reduceMotion }: { reduceMotion: boolean }) {
  const [player, setPlayer] = useState<DotLottie | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!player) return;

    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("error");

    if (player.isLoaded) onLoad();
    player.addEventListener("load", onLoad);
    player.addEventListener("loadError", onError);

    return () => {
      player.removeEventListener("load", onLoad);
      player.removeEventListener("loadError", onError);
    };
  }, [player]);

  const showPoster = status !== "ready";

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ ["--ar" as string]: LOTTIE_AR }}
      data-asset-width="850"
      data-asset-height="950"
    >
      <div
        className="relative w-full"
        style={{ aspectRatio: "var(--ar)" }}
        role="img"
        aria-label="UseJunction AI coding observability overview"
      >
        {showPoster ? (
          // eslint-disable-next-line @next/next/no-img-element -- static GIF poster; not a responsive photo
          <img
            src={HERO_POSTER_SRC}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-contain"
            decoding="async"
            fetchPriority="high"
          />
        ) : null}

        {status !== "error" ? (
          <DotLottieReact
            src={HERO_LOTTIE_SRC}
            autoplay={!reduceMotion}
            loop
            renderConfig={{ autoResize: true }}
            dotLottieRefCallback={setPlayer}
            className={`h-full w-full transition-opacity duration-300 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
            style={{ width: "100%", height: "100%" }}
          />
        ) : null}
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
            <motion.p variants={item} className="text-sm font-medium uppercase tracking-[0.18em] text-[#1688a1]">
            For engineering and platform teams
            </motion.p>

            <motion.h1
              variants={item}
              className="mt-4 max-w-xl text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--public-fg)] sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem]"
            >
              Find wasted AI coding subscriptions
              <br />
              <span className="font-semibold text-[#08a8c4]">before your next renewal.</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="mt-3 max-w-md text-base italic leading-relaxed text-[#6b6d66] sm:text-lg sm:leading-8"
            >
              UseJunction connects Cursor, Claude Code, and Codex usage so you can see idle seats, plan-limit pressure, and tool overlap across your team.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex w-full flex-col items-center lg:items-start">
              <motion.div
                whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                className="inline-flex"
              >
                <Link
                  href={`${siteConfig.signupUrl}?from=${encodeURIComponent("/onboarding?mode=solo")}`}
                  className="public-btn public-btn-teal rounded-none px-8 py-3 text-base font-semibold"
                >
                  Analyze my own usage
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </motion.div>
              <p className="mt-3 text-sm text-[#5c5e56]">
                Start with one developer. Add your team when the signal is clear.
              </p>
            </motion.div>
          </motion.div>

          {/* Single instance — never display:none (DotLottie blank-canvas pitfall) */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="relative mx-auto flex w-full max-w-[min(100%,340px)] items-center justify-center lg:mx-0 lg:max-w-[min(48vw,calc(72svh*0.9),720px)] lg:justify-end lg:self-center"
            aria-hidden
          >
            <HeroLottie reduceMotion={reduceMotion === true} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
