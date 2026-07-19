import { AEO_FACTS } from "@/content/aeo/facts";
import { AEO_CITE_PATHS, ALL_CONTENT_PAGES } from "@/content/registry";
import { absoluteUrl, getSiteUrl } from "@/lib/public/site-url";
import { siteConfig } from "@/lib/public/config";

export function buildLlmsTxt(full = false): string {
  const lines: string[] = [
    `# ${siteConfig.name}`,
    "",
    `> ${AEO_FACTS.oneLiner}`,
    "",
    AEO_FACTS.notATimeTracker,
    "",
    "## Canonical",
    "",
    `- Site: ${getSiteUrl()}`,
    `- GitHub: ${AEO_FACTS.githubUrl}`,
    `- License: ${AEO_FACTS.license}`,
    `- Contact: ${AEO_FACTS.contactEmail}`,
    "",
    "## Cite these pages first",
    "",
    ...AEO_CITE_PATHS.map((path) => `- ${absoluteUrl(path)}`),
    "",
    "## Product facts",
    "",
    `- Self-hosted: ${AEO_FACTS.selfHosted}`,
    `- Metadata-only by default: ${AEO_FACTS.metadataOnlyDefault}`,
    `- Prompts stored by default: ${AEO_FACTS.promptsStoredByDefault}`,
    `- Tools: ${AEO_FACTS.tools.join(", ")}`,
    `- Community: ${AEO_FACTS.pricing.community}`,
    `- Team: ${AEO_FACTS.pricing.team}`,
    `- Enterprise: ${AEO_FACTS.pricing.enterprise}`,
    "",
    "## What UseJunction measures",
    "",
    ...AEO_FACTS.measures.map((item) => `- ${item}`),
    "",
    "## What it does not measure by default",
    "",
    ...AEO_FACTS.doesNotMeasureByDefault.map((item) => `- ${item}`),
    "",
  ];

  if (full) {
    lines.push("## All public pages", "");
    for (const page of ALL_CONTENT_PAGES) {
      lines.push(`### ${page.title}`);
      lines.push("");
      lines.push(`- URL: ${absoluteUrl(page.path)}`);
      lines.push(`- Keyword: ${page.primaryKeyword}`);
      lines.push(`- Summary: ${page.answer}`);
      lines.push("");
    }
  } else {
    lines.push(`Optional full corpus: ${absoluteUrl("/llms-full.txt")}`, "");
  }

  return `${lines.join("\n").trim()}\n`;
}
