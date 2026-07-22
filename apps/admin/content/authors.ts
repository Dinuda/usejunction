import type { Author } from "@/content/types";

export const DINUDA_YAGGAHAVITA: Author = {
  slug: "dinuda-yaggahavita",
  name: "Dinuda Yaggahavita",
  role: "Founder of UseJunction",
  bio: "Dinuda is building UseJunction, an open-source observability layer for the AI coding tools, models, and plans engineering teams already use. His work focuses on making fragmented AI systems visible without turning operational data into developer surveillance.",
  initials: "DY",
  path: "/authors/dinuda-yaggahavita",
  links: [
    { label: "GitHub", href: "https://github.com/Dinuda" },
    { label: "Medium", href: "https://dinuday.medium.com" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/dinuda/" },
  ],
};

export const AUTHORS = [DINUDA_YAGGAHAVITA] as const;

export function getAuthorBySlug(slug: string): Author | undefined {
  return AUTHORS.find((author) => author.slug === slug);
}
