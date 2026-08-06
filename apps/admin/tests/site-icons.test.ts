import assert from "node:assert/strict";
import { test } from "vitest";
import { manifestIcons, siteIcons } from "../lib/public/site-icons";

test("site icons use absolute canonical URLs for crawlers", () => {
  const iconUrls = [
    ...(Array.isArray(siteIcons.icon) ? siteIcons.icon : [siteIcons.icon]),
    ...(Array.isArray(siteIcons.apple) ? siteIcons.apple : siteIcons.apple ? [siteIcons.apple] : []),
    siteIcons.shortcut,
  ]
    .filter(Boolean)
    .map((entry) => (typeof entry === "string" ? entry : entry.url));

  for (const url of iconUrls) {
    assert.match(String(url), /^https:\/\/usejunction\.dev\//);
  }

  const iconSizes = (Array.isArray(siteIcons.icon) ? siteIcons.icon : [siteIcons.icon])
    .filter((entry): entry is { sizes?: string } => typeof entry === "object" && entry !== null)
    .map((entry) => entry.sizes);
  assert.ok(iconSizes.includes("16x16"));
  assert.ok(iconSizes.includes("32x32"));

  for (const icon of manifestIcons) {
    assert.match(icon.src, /^https:\/\/usejunction\.dev\//);
    assert.doesNotMatch(icon.src, /\.svg$/);
  }
});
