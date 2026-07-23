import { TEAM_PRICE_PER_DEV_USD, USER_LIMIT_FREE } from "@/lib/saas-billing/entitlements";

export const TEAM_CHECKOUT_MEDIA_PATHS = [
  "/images/laptop-tile.png",
  "/images/person-tile.png",
  "/images/connecting-computer.png",
] as const;

export const TEAM_CHECKOUT_BUTTON_COLOR = "#08758a";

export function teamCheckoutMediaUrls(baseUrl: string): string[] {
  const origin = baseUrl.replace(/\/$/, "");
  return TEAM_CHECKOUT_MEDIA_PATHS.map((path) => `${origin}${path}`);
}

export function teamCheckoutDescription(quantity: number): string {
  const memberLabel = quantity === 1 ? "member" : "members";
  const seats = Math.max(1, quantity);

  return [
    `<p>Hosted UseJunction for your whole team — usage, cost attribution, Signals, and device health in one control plane.</p>`,
    `<p><strong>$${TEAM_PRICE_PER_DEV_USD}.00</strong> per active developer / month · <strong>${seats} active ${memberLabel}</strong> on this bill.</p>`,
    `<ul>`,
    `<li>Unlimited seats beyond the free Community cap of ${USER_LIMIT_FREE}</li>`,
    `<li>Multiple devices per developer</li>`,
    `<li>Advanced Signals, work sessions, and reporting</li>`,
    `</ul>`,
    `<p>Members who join or leave are reflected automatically on your next bill.</p>`,
  ].join("");
}
