import assert from "node:assert/strict";
import { test } from "vitest";
import { ALL_CONTENT_PAGES, AEO_CITE_PATHS, buildSitemapEntries, contentBreadcrumbs } from "../content/registry";
import { buildLlmsTxt } from "../lib/public/llms-txt";
import { buildHomeJsonLd } from "../lib/public/json-ld";
import { AEO_FACTS } from "../content/aeo/facts";
import { BLOG_POSTS } from "../content/blog";
import { buildBlogPostJsonLd } from "../lib/public/json-ld";

test("seo registry includes priority guides and compare pages", () => {
  const paths = new Set(ALL_CONTENT_PAGES.map((page) => page.path));
  assert.ok(paths.has("/guides/see-plan-usage-and-waste"));
  assert.ok(paths.has("/guides/see-team-ai-coding-usage"));
  assert.ok(paths.has("/guides/open-source-wakatime-alternative-for-ai-coding"));
  assert.ok(paths.has("/compare/wakatime"));
  assert.ok(paths.has("/for/cursor"));
  assert.ok(paths.has("/for/claude-code"));
  assert.ok(paths.has("/privacy"));
  assert.ok(paths.has("/terms"));
});

test("all SUPPORTED_TOOLS-adjacent /for pages are published", () => {
  const paths = new Set(ALL_CONTENT_PAGES.map((page) => page.path));
  for (const slug of ["cursor", "claude-code", "codex", "github-copilot", "ollama", "continue", "cline", "roo-code", "opencode", "lm-studio"]) {
    assert.ok(paths.has(`/for/${slug}`), `missing /for/${slug}`);
  }
});

test("content breadcrumbs place hub between home and page", () => {
  const guide = ALL_CONTENT_PAGES.find((page) => page.path === "/guides/see-plan-usage-and-waste");
  assert.ok(guide);
  const crumbs = contentBreadcrumbs(guide!);
  assert.equal(crumbs[0]?.label, "Home");
  assert.equal(crumbs[1]?.href, "/guides");
  assert.equal(crumbs[crumbs.length - 1]?.label, guide!.title);
});

test("sitemap includes home and content hubs", () => {
  const entries = buildSitemapEntries();
  const paths = entries.map((entry) => entry.path);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/guides"));
  assert.ok(paths.includes("/blog/what-is-ai-coding-observability"));
  assert.ok(paths.includes("/authors/dinuda-yaggahavita"));
  assert.ok(!paths.includes("/blog/visibility-before-control"));
  assert.ok(!paths.includes("/blog/stop-wasting-ai-coding-seats"));
  assert.equal(entries[0]?.priority, 1);
});

test("llms.txt includes cite paths and non-claims", () => {
  const text = buildLlmsTxt(false);
  assert.match(text, /UseJunction/);
  assert.match(text, /not a WakaTime-style/i);
  for (const path of AEO_CITE_PATHS) {
    assert.match(text, new RegExp(path.replace(/\//g, "\\/")));
  }
  assert.match(text, /llms-full\.txt/);
});

test("llms-full.txt includes page summaries", () => {
  const text = buildLlmsTxt(true);
  assert.match(text, /How to See AI Coding Plan Usage/);
  assert.match(text, /What Is AI Coding Observability/);
  assert.ok(text.length > buildLlmsTxt(false).length);
});

test("native blog exposes one canonical founder-authored post", () => {
  assert.equal(BLOG_POSTS.length, 1);
  const post = BLOG_POSTS[0]!;
  assert.equal(post.path, "/blog/what-is-ai-coding-observability");
  assert.equal(post.author.name, "Dinuda Yaggahavita");
  assert.notEqual(post.publishedAt, "");
  assert.equal(post.socialImage.width, 1200);
  assert.equal(post.socialImage.height, 630);
  const graph = buildBlogPostJsonLd(post);
  const article = graph.find((node) => node["@type"] === "BlogPosting");
  assert.ok(article);
  assert.equal((article!.author as { name: string }).name, "Dinuda Yaggahavita");
  assert.equal(article!.datePublished, "2026-07-22");
});

test("home JSON-LD includes FAQPage and Organization", () => {
  const graph = buildHomeJsonLd();
  const types = graph.map((node) => node["@type"]);
  assert.ok(types.includes("FAQPage"));
  assert.ok(types.includes("Organization"));
  assert.ok(types.includes("SoftwareApplication"));
  assert.equal(AEO_FACTS.privacyFirst, true);
  assert.equal(AEO_FACTS.workDetailOptional, true);
});
