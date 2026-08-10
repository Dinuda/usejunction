/** Domains Resend rejects to protect deliverability (RFC 2606 and special-use TLDs). */
const UNDELIVERABLE_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "localhost",
]);

const UNDELIVERABLE_TLDS = new Set(["test", "invalid", "localhost"]);

export class UndeliverableEmailRecipientError extends Error {
  readonly to: string;

  constructor(to: string) {
    super(`Undeliverable email recipient: ${to}`);
    this.name = "UndeliverableEmailRecipientError";
    this.to = to;
  }
}

function extractEmailAddress(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const bracketed = trimmed.match(/<([^>]+)>$/);
  const email = bracketed?.[1] ?? trimmed;
  if (!email.includes("@")) return null;
  return email;
}

export function isUndeliverableEmailRecipient(to: string): boolean {
  const email = extractEmailAddress(to);
  if (!email) return true;

  const at = email.lastIndexOf("@");
  if (at < 0) return true;

  const domain = email.slice(at + 1);
  if (UNDELIVERABLE_DOMAINS.has(domain)) return true;

  const tld = domain.split(".").pop();
  if (tld && UNDELIVERABLE_TLDS.has(tld)) return true;

  return false;
}

export function isResendUndeliverableToError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);

  if (!message.includes("Invalid `to` field")) return false;

  return (
    message.includes("example.com") ||
    message.includes("testing email address") ||
    message.toLowerCase().includes("reserved")
  );
}
