import { ContentHub } from "@/components/public/content-hub";
import { COMPARE_PAGES } from "@/content/compare";
import { hubMetadata } from "@/lib/public/seo-metadata";

export const metadata = hubMetadata({
  title: "Compare",
  description:
    "Compare UseJunction to Jellyfish, DX, LinearB, WakaTime, Helicone, Portkey, and Langfuse—match the tool to the problem you are searching for.",
  path: "/compare",
});

export default function CompareIndexPage() {
  return (
    <ContentHub
      title="Compare"
      description="See how UseJunction differs from engineering intelligence platforms and LLM gateways. Seat waste, AI coding cost, and multi-tool visibility—not a feature-parity claim."
      path="/compare"
      items={COMPARE_PAGES.map((page) => ({
        title: page.title,
        description: page.description,
        path: page.path,
      }))}
    />
  );
}
