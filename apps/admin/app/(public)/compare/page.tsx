import { ContentHub } from "@/components/public/content-hub";
import { COMPARE_PAGES } from "@/content/compare";
import { hubMetadata } from "@/lib/public/seo-metadata";

export const metadata = hubMetadata({
  title: "Compare",
  description:
    "Compare UseJunction to WakaTime, Helicone, Portkey, and Langfuse—honest differentiation for AI coding observability.",
  path: "/compare",
});

export default function CompareIndexPage() {
  return (
    <ContentHub
      title="Compare"
      description="See how UseJunction differs from time trackers and LLM gateways. Visibility for AI coding tools—not a feature-parity claim."
      path="/compare"
      items={COMPARE_PAGES.map((page) => ({
        title: page.title,
        description: page.description,
        path: page.path,
      }))}
    />
  );
}
