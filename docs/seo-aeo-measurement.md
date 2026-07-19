# SEO / AEO measurement checklist

Operational checklist after shipping the on-site SEO + AEO system. Not automated CI—run after each production deploy that changes public URLs.

## One-time setup

1. Confirm canonical host is `https://usejunction.dev` (www / `.com` → `.dev` redirects live).
2. Set env vars in production:
   - `GOOGLE_SITE_VERIFICATION` (from GSC), `BING_SITE_VERIFICATION` (from Bing) — rendered as meta tags
   - `NEXT_PUBLIC_TWITTER_HANDLE` (defaults to `@usejunction`)
   - `INDEXNOW_KEY` (any 8+ char string / UUID)
3. Google Search Console — property for `usejunction.dev`
   - Submit `https://usejunction.dev/sitemap.xml`
   - Request indexing for `/`, priority guides, `/llms.txt`
4. Bing Webmaster Tools — import from GSC or submit the same sitemap
5. IndexNow — after each deploy that changes public URLs, ping:
   - `curl -X POST "https://usejunction.dev/api/indexnow?key=$INDEXNOW_KEY"`
   - Confirm `https://usejunction.dev/indexnow-key.txt` returns the key
6. Verify fetch:
   - `/robots.txt` disallows `/dashboard`, `/api/`, auth routes
   - `/sitemap.xml` lists all public guides/compare/for/blog/legal hubs
   - `/manifest.webmanifest` returns JSON
   - `/llms.txt` and `/llms-full.txt` return plain text
   - `/blog/rss.xml` returns the blog feed
7. Share a homepage URL in Slack/iMessage and confirm large OG image renders

## Monthly AEO probe list

Run each query in Google (AI Overview if shown), Bing Copilot, Perplexity, and ChatGPT (with browsing if available). Record whether UseJunction is cited or linked.

| Query | Target URL |
|-------|------------|
| open source wakatime alternative | `/guides/open-source-wakatime-alternative-for-ai-coding`, `/compare/wakatime` |
| how to see Cursor plan usage for my team | `/guides/see-plan-usage-and-waste`, `/for/cursor` |
| are we wasting Cursor Pro seats | `/guides/see-plan-usage-and-waste`, `/blog/stop-wasting-ai-coding-seats` |
| see my team's AI coding insights | `/guides/see-team-ai-coding-usage` |
| AI coding observability open source | `/` |
| Cursor Claude Code usage dashboard self-hosted | `/for/cursor`, `/for/claude-code` |
| personal API key detection AI coding tools | `/guides/personal-vs-company-api-keys` |
| UseJunction vs Helicone | `/compare/helicone` |

## Ranking / GSC watchlist

- Brand: `usejunction`, `use junction`
- Cluster A: `AI coding observability`, `open source AI coding analytics`
- Cluster B: `Cursor seat utilization`, `Claude Code plan usage`
- Cluster C: `open source wakatime alternative`, `team coding insights AI`

## Conversion signals

- Organic landings → `/signup`
- Organic → GitHub stars/clones from README links
- Contact form from `/contact` with enterprise intent

## Content cadence

After foundation: 2 guides **or** 1 compare + 1 `/for/*` page per month. Refresh FAQ answer blocks when product copy changes.
