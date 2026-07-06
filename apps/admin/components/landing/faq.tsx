import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqItems } from "@/lib/landing/config";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/50 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Frequently asked questions</h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know before joining the waitlist.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
