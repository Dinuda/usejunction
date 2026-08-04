import { ContentHub } from "@/components/public/content-hub";
import { SOLUTIONS } from "@/content/solutions";
import { hubMetadata } from "@/lib/public/seo-metadata";

export const metadata = hubMetadata({
  title: "AI Coding Spend Solutions for Teams",
  description:
    "Practical solutions for AI coding spend management, seat utilization, plan usage, and cross-tool visibility across engineering teams.",
  path: "/solutions",
});

export default function SolutionsIndexPage() {
  return (
    <ContentHub
      title="AI coding spend solutions"
      description="Problem-led pages for engineering and platform teams managing AI coding cost, seats, quotas, and tool adoption."
      path="/solutions"
      items={SOLUTIONS.map((solution) => ({
        title: solution.title,
        description: solution.description,
        path: solution.path,
      }))}
    />
  );
}
