"use client";

import Link from "next/link";
import { buildHubJsonLd } from "@/lib/public/json-ld";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { SiteFooter } from "@/components/public/site-footer";

export function ContentHub({
  title,
  description,
  path,
  items,
}: {
  title: string;
  description: string;
  path: string;
  items: { title: string; description: string; path: string }[];
}) {
  const jsonLd = buildHubJsonLd({
    name: title,
    description,
    path,
    items: items.map((item) => ({ name: item.title, path: item.path })),
  });

  return (
    <>
      {jsonLd.map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-28 sm:px-5 lg:px-8 lg:pb-24 lg:pt-32">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
        <h1 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">{description}</p>
        <ul className="mt-12 grid gap-6">
          {items.map((item) => (
            <li key={item.path} className="border-b border-border pb-6">
              <Link href={item.path} className="text-lg font-semibold text-primary hover:underline">
                {item.title}
              </Link>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
