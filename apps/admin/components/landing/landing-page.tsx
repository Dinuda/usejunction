import { LandingNav } from "@/components/landing/landing-nav";
import { Hero } from "@/components/landing/hero";
import { TrustStrip } from "@/components/landing/trust-strip";
import { ProductPreview } from "@/components/landing/product-preview";
import { ProblemStatement } from "@/components/landing/problem-statement";
import { Capabilities } from "@/components/landing/capabilities";
import { Workflow } from "@/components/landing/workflow";
import { Differentiation } from "@/components/landing/differentiation";
import { Faq } from "@/components/landing/faq";
import { CtaBand } from "@/components/landing/cta-band";
import { Footer } from "@/components/landing/footer";

export function LandingPage() {
  return (
    <div className="landing-grid min-h-screen">
      <LandingNav />
      <main>
        <Hero />
        <TrustStrip />
        <ProductPreview />
        <ProblemStatement />
        <Capabilities />
        <Workflow />
        <Differentiation />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
