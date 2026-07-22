export type ContentFaq = {
  question: string;
  answer: string;
};

export type ContentSection = {
  heading: string;
  body: string[];
};

export type HowToStep = {
  name: string;
  text: string;
};

export type ContentPage = {
  kind: "guide" | "compare" | "for" | "blog" | "legal";
  slug: string;
  /** Path without leading domain, e.g. /guides/foo */
  path: string;
  title: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  updatedAt: string;
  /** First ~100 words — AEO answer block */
  answer: string;
  sections: ContentSection[];
  faq: ContentFaq[];
  relatedPaths: string[];
  howTo?: {
    name: string;
    description: string;
    steps: HowToStep[];
  };
  compareRows?: { feature: string; usejunction: string; other: string }[];
  compareOtherName?: string;
};

export type SitemapEntry = {
  path: string;
  lastModified: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

export type Author = {
  slug: string;
  name: string;
  role: string;
  bio: string;
  initials: string;
  path: string;
  links: { label: string; href: string }[];
};

export type BlogInline = {
  text: string;
  strong?: boolean;
  href?: string;
};

export type BlogImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
};

export type BlogBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; content: BlogInline[] }
  | { type: "list"; items: BlogInline[][] }
  | { type: "quote"; content: BlogInline[] }
  | { type: "image"; image: BlogImage };

export type BlogPost = {
  slug: string;
  path: string;
  title: string;
  description: string;
  answer: string;
  primaryKeyword: string;
  topics: string[];
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  author: Author;
  heroImage: BlogImage;
  socialImage: BlogImage;
  blocks: BlogBlock[];
  relatedPaths: string[];
};
