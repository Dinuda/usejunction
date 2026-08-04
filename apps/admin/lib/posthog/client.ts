import posthog from "posthog-js";

export const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/** Clear the identified person before any auth flow leaves the current page. */
export function resetPostHogIdentity() {
  if (isPostHogConfigured) posthog.reset();
}
