"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";
import { isPostHogConfigured, resetPostHogIdentity } from "@/lib/posthog/client";

/** Keeps PostHog's browser identity aligned with the active NextAuth session. */
export function PostHogIdentity() {
  const { data: session, status } = useSession();
  const lastUserId = useRef<string | null>(null);
  const lastIdentityFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!isPostHogConfigured || status === "loading") return;

    const user = session?.user;
    if (status === "authenticated" && user?.id) {
      // A direct account switch must not merge two real users into one PostHog
      // person. Reset first, then identify the newly authenticated account.
      if (lastUserId.current && lastUserId.current !== user.id) {
        resetPostHogIdentity();
      }

      const properties = {
        ...(user.email ? { email: user.email } : {}),
        ...(user.name ? { name: user.name } : {}),
        ...(user.orgId ? { organization_id: user.orgId } : {}),
        ...(user.role ? { organization_role: user.role } : {}),
      };
      const fingerprint = JSON.stringify([user.id, properties]);

      if (lastIdentityFingerprint.current !== fingerprint) {
        posthog.identify(user.id, properties);
        lastIdentityFingerprint.current = fingerprint;
      }
      if (user.orgId) {
        posthog.group("organization", user.orgId);
      }

      lastUserId.current = user.id;
      return;
    }

    // Preserve anonymous sessions across signed-out page loads, but reset when
    // an authenticated session transitions to signed out without navigating.
    if (lastUserId.current) resetPostHogIdentity();
    lastUserId.current = null;
    lastIdentityFingerprint.current = null;
  }, [
    session?.user?.email,
    session?.user?.id,
    session?.user?.name,
    session?.user?.orgId,
    session?.user?.role,
    status,
  ]);

  return null;
}
