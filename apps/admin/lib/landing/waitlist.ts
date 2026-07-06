/**
 * Isolated waitlist submission handler.
 * Wire in a backend or email provider here without reshaping the component tree.
 */
export type WaitlistResult = { ok: true } | { ok: false; error: string };

export async function submitWaitlist(email: string): Promise<WaitlistResult> {
  // UI-only phase: simulate network latency, no persistence.
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (email.endsWith("@fail.test")) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true };
}
