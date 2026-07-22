import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { BlogPost } from "@/content/types";
import { buildHubJsonLd } from "@/lib/public/json-ld";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { SiteFooter } from "@/components/public/site-footer";

export function BlogIndex({ posts }: { posts: BlogPost[] }) {
  const jsonLd = buildHubJsonLd({ name: "UseJunction Blog", description: "Field notes on operating AI coding infrastructure with visibility before control.", path: "/blog", items: posts.map((post) => ({ name: post.title, path: post.path })) });
  return (
    <>
      {jsonLd.map((data, index) => <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />)}
      <main className="min-h-[70vh] pt-28 lg:pt-32">
        <section className="uj-grid-texture border-b border-border bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 lg:px-10 lg:pb-20">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog" }]} />
            <p className="mt-9 font-mono text-xs uppercase tracking-[0.18em] text-primary">UseJunction field notes</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Observe the system. Respect the developer.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Essays on AI coding observability, infrastructure, cost, privacy, and the case for visibility before control.</p>
          </div>
        </section>
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          {posts.map((post) => (
            <article key={post.path} className="group grid overflow-hidden border border-border bg-white lg:grid-cols-[1.08fr_0.92fr]">
              <Link href={post.path} className="overflow-hidden border-b border-border bg-muted lg:border-b-0 lg:border-r" aria-label={`Read ${post.title}`}>
                <Image src={post.heroImage.src} alt={post.heroImage.alt} width={post.heroImage.width} height={post.heroImage.height} priority sizes="(max-width: 1024px) 100vw, 55vw" className="h-full min-h-64 w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]" />
              </Link>
              <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">AI infrastructure</p>
                  <h2 className="mt-4 font-display text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl"><Link href={post.path} className="hover:text-primary">{post.title}</Link></h2>
                  <p className="mt-4 leading-7 text-muted-foreground">{post.description}</p>
                </div>
                <div className="mt-10 flex items-end justify-between gap-5 border-t border-border pt-5">
                  <div><p className="text-sm font-semibold">{post.author.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">22 July 2026 · {post.readingMinutes} min read</p></div>
                  <Link href={post.path} className="flex size-10 items-center justify-center bg-brand-yellow text-foreground" aria-label={`Read ${post.title}`}><ArrowUpRight className="size-4" /></Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
