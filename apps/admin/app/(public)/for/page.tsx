import { ContentHub } from "@/components/public/content-hub";
import { FOR_PAGES } from "@/content/for";
import { hubMetadata } from "@/lib/public/seo-metadata";

export const metadata = hubMetadata({
  title: "For AI coding tools",
  description:
    "Track Cursor, Claude Code, Codex, Copilot, and Ollama usage across your engineering team with UseJunction.",
  path: "/for",
});

export default function ForIndexPage() {
  return (
    <ContentHub
      title="For AI coding tools"
      description="Tool-specific pages for org-wide usage, cost, and plan utilization—open-source and self-hosted."
      path="/for"
      items={FOR_PAGES.map((page) => ({
        title: page.title,
        description: page.description,
        path: page.path,
      }))}
    />
  );
}
