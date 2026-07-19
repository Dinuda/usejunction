import { buildSitemapEntries } from "@/content/registry";
import { absoluteUrl, getSiteUrl } from "@/lib/public/site-url";

export function getIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && key.length >= 8 ? key : null;
}

export function getKeyLocation(): string {
  return absoluteUrl("/indexnow-key.txt");
}

/**
 * Submit all public URLs to the IndexNow API (Bing, Yandex, etc.).
 * No-op unless INDEXNOW_KEY is set.
 */
export async function submitAllUrls(): Promise<{ submitted: number; ok: boolean; status?: number }> {
  const key = getIndexNowKey();
  if (!key) return { submitted: 0, ok: false };

  const host = new URL(getSiteUrl()).host;
  const urlList = buildSitemapEntries().map((entry) => absoluteUrl(entry.path));

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      keyLocation: getKeyLocation(),
      urlList,
    }),
  });

  return { submitted: urlList.length, ok: response.ok, status: response.status };
}
