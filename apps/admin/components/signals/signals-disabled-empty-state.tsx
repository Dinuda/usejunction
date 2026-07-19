import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function WorkSignalIllustration() {
  return (
    <div aria-hidden="true" className="flex h-52 w-[22rem] max-w-full items-center justify-center">
      <Image
        src="/icons/not-signals.png"
        alt=""
        width={1620}
        height={971}
        priority
        className="h-auto w-[22rem] max-w-full object-contain"
      />
    </div>
  );
}

export function SignalsDisabledEmptyState() {
  return (
    <section className="flex min-h-[clamp(30rem,58vh,42rem)] items-start justify-center px-4 pb-16 pt-[clamp(2rem,7vh,5rem)]">
      <div className="flex w-full max-w-lg flex-col items-center text-center">
        <WorkSignalIllustration />
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Help everyone do more of what works.
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
          Signals shows what works, what can be automated, and what should stay human.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-6 rounded-none bg-foreground px-5 !text-background shadow-sm hover:bg-foreground/90"
        >
          <Link href="/settings">
            Open Settings
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
