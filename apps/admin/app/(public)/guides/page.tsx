import { ContentHub } from "@/components/public/content-hub";
import { GUIDES } from "@/content/guides";
import { hubMetadata } from "@/lib/public/seo-metadata";

export const metadata = hubMetadata({
  title: "Guides",
  description:
    "How to see AI coding plan usage, team insights, personal API keys, and open-source alternatives for AI coding observability.",
  path: "/guides",
});

export default function GuidesIndexPage() {
  return (
    <ContentHub
      title="Guides"
      description="Practical answers for platform and engineering teams: plan usage and waste, team AI coding insights, and honest comparisons."
      path="/guides"
      items={GUIDES.map((guide) => ({
        title: guide.title,
        description: guide.description,
        path: guide.path,
      }))}
    />
  );
}
