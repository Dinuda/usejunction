import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BlogPost } from "@/content/types";
import { getContentByPath } from "@/content/registry";
import { buildBlogPostJsonLd } from "@/lib/public/json-ld";
import { siteConfig } from "@/lib/public/config";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { BlogInlineContent } from "@/components/public/blog-inline";
import { SiteFooter } from "@/components/public/site-footer";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

export function BlogArticle({ post }: { post: BlogPost }) {
  const jsonLd = buildBlogPostJsonLd(post);
  const related = post.relatedPaths.map(getContentByPath).filter((page) => page !== undefined);

  return (
    <>
      {jsonLd.map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}
      <main>
        <header className="uj-grid-texture overflow-hidden border-b border-border bg-white pt-28 lg:pt-32">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 lg:px-10 lg:pb-16">
            <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: post.title }]} />
            <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Field note · AI infrastructure</p>
                <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                  {post.title}
                </h1>
                <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">{post.description}</p>
              </div>
              <aside className="border-l-2 border-brand-yellow bg-background p-5">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">Written by</p>
                <Link href={post.author.path} className="mt-3 flex items-center gap-3 hover:text-primary">
                  <span className="flex size-11 shrink-0 items-center justify-center border border-primary/30 bg-primary-pale font-mono text-sm font-semibold text-primary">
                    {post.author.initials}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{post.author.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{post.author.role}</span>
                  </span>
                </Link>
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> · {post.readingMinutes} min read
                </p>
              </aside>
            </div>
          </div>
        </header>

        <article className="mx-auto w-full max-w-[760px] px-4 py-14 sm:px-6 sm:py-16 lg:py-24">
          {post.blocks.map((block, index) => {
            if (block.type === "heading") {
              return <h2 key={`${block.text}-${index}`} className="mt-16 font-display text-2xl font-semibold leading-tight tracking-[-0.025em] text-foreground sm:text-3xl">{block.text}</h2>;
            }
            if (block.type === "paragraph") {
              return <p key={index} className="mt-6 text-[1.0625rem] leading-8 text-muted-foreground sm:text-lg sm:leading-9"><BlogInlineContent content={block.content} /></p>;
            }
            if (block.type === "list") {
              return (
                <ul key={index} className="mt-6 grid gap-3 border-l border-primary/35 pl-6 text-[1.0625rem] leading-8 text-muted-foreground sm:text-lg">
                  {block.items.map((item, itemIndex) => <li key={itemIndex} className="relative before:absolute before:-left-[1.65rem] before:top-[0.9rem] before:size-2 before:bg-brand-yellow"><BlogInlineContent content={item} /></li>)}
                </ul>
              );
            }
            if (block.type === "quote") {
              return <blockquote key={index} className="my-10 border-y border-border bg-brand-yellow-pale px-6 py-7 font-display text-xl font-medium leading-8 text-foreground sm:px-8 sm:text-2xl sm:leading-9"><BlogInlineContent content={block.content} /></blockquote>;
            }
            return (
              <figure key={index} className="my-10 overflow-hidden border border-border bg-white p-2 shadow-[0_18px_42px_-34px_rgba(17,18,16,0.45)] sm:my-12 sm:p-3">
                <Image src={block.image.src} alt={block.image.alt} width={block.image.width} height={block.image.height} sizes="(max-width: 800px) 92vw, 760px" className="h-auto w-full" />
                {block.image.caption ? <figcaption className="px-2 pb-1 pt-3 font-mono text-xs text-muted-foreground">{block.image.caption}</figcaption> : null}
              </figure>
            );
          })}

          <section className="mt-16 border border-primary/25 bg-primary-pale p-6 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Visibility before control</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">See your AI coding stack as one system.</h2>
            <p className="mt-3 leading-7 text-muted-foreground">Run UseJunction on infrastructure you control, or start with the managed control plane.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={siteConfig.signupUrl} className="public-btn public-btn-yellow rounded-none font-semibold">Get started <ArrowRight className="size-4" /></Link>
              <Link href={siteConfig.githubUrl} target="_blank" rel="noopener noreferrer" className="public-btn public-btn-outline rounded-none font-semibold">View on GitHub</Link>
            </div>
          </section>

          <section className="mt-16 border-t border-border pt-10">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">About the author</p>
            <div className="mt-5 flex gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center border border-primary/30 bg-primary-pale font-mono text-sm font-semibold text-primary">{post.author.initials}</span>
              <div>
                <Link href={post.author.path} className="font-semibold hover:text-primary">{post.author.name}</Link>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{post.author.bio}</p>
              </div>
            </div>
          </section>

          {related.length ? (
            <nav className="mt-14 border-t border-border pt-10" aria-label="Related reading">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Continue reading</p>
              <ul className="mt-5 grid gap-3">
                {related.map((page) => <li key={page.path}><Link href={page.path} className="font-medium text-primary hover:underline">{page.title}</Link></li>)}
              </ul>
            </nav>
          ) : null}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
