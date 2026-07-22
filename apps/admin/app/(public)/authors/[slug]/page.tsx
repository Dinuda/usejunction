import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { AUTHORS, getAuthorBySlug } from "@/content/authors";
import { BLOG_POSTS } from "@/content/blog";
import { absoluteUrl } from "@/lib/public/site-url";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { SiteFooter } from "@/components/public/site-footer";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return AUTHORS.map((author) => ({ slug: author.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = getAuthorBySlug((await params).slug);
  if (!author) return {};
  return {
    title: `${author.name}, ${author.role}`,
    description: author.bio,
    alternates: { canonical: absoluteUrl(author.path) },
    openGraph: { title: `${author.name} — ${author.role}`, description: author.bio, url: absoluteUrl(author.path), type: "profile" },
  };
}

export default async function AuthorPage({ params }: Props) {
  const author = getAuthorBySlug((await params).slug);
  if (!author) notFound();
  const posts = BLOG_POSTS.filter((post) => post.author.slug === author.slug);
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    url: absoluteUrl(author.path),
    worksFor: { "@type": "Organization", name: "UseJunction", url: absoluteUrl("/") },
    sameAs: author.links.map((item) => item.href),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />
      <main className="min-h-[70vh] pt-28 lg:pt-32">
        <section className="uj-grid-texture border-b border-border bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6 lg:px-10 lg:pb-20">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Authors" }, { label: author.name }]} />
            <div className="mt-10 grid gap-7 sm:grid-cols-[7rem_1fr] sm:items-start">
              <div className="flex size-28 items-center justify-center border border-primary/30 bg-primary-pale font-mono text-2xl font-semibold text-primary">{author.initials}</div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{author.role}</p>
                <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{author.name}</h1>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{author.bio}</p>
                <div className="mt-6 flex flex-wrap gap-3">{author.links.map((item) => <Link key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="public-btn public-btn-outline rounded-none">{item.label}<ArrowUpRight className="size-3.5" /></Link>)}</div>
              </div>
            </div>
          </div>
        </section>
        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Articles</p>
          <div className="mt-6 grid gap-4">{posts.map((post) => <Link key={post.path} href={post.path} className="group border border-border bg-white p-6 transition-colors hover:border-primary/50"><h2 className="font-display text-xl font-semibold group-hover:text-primary">{post.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{post.description}</p></Link>)}</div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
