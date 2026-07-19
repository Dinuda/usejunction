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
