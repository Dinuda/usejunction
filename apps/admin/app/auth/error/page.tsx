"use client";

import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  isOAuthProviderId,
  OAUTH_PROVIDER_LABELS,
  safeAuthReturnPath,
} from "@/lib/auth/oauth-account-conflict";
import { OAuthAccountConflictActions } from "./oauth-account-conflict-actions";
import { useRawQuery } from "@/lib/api/client";

const ERROR_COPY: Record<string, { title: string; description: string; detail: string }> = {
  Configuration: {
    title: "Sign-in was interrupted.",
    description: "We couldn’t finish signing you in right now.",
    detail: "Try again in a moment. New Google, GitHub, or Microsoft accounts are created automatically on first sign-in.",
  },
  AccessDenied: {
    title: "Access denied.",
    description: "You don’t have permission to sign in with this account.",
    detail: "Use a different account, or ask your administrator for access.",
  },
  Verification: {
    title: "This link is no longer valid.",
    description: "The sign-in link expired or was already used.",
    detail: "Request a new link and try again.",
  },
  OAuthAccountNotLinked: {
    title: "Account already exists.",
    description: "This email is already linked to another sign-in method.",
    detail: "Sign in with the method you used originally.",
  },
  OAuthSignin: {
    title: "Couldn’t start sign-in.",
    description: "The identity provider couldn’t be reached.",
    detail: "Try again in a moment, or use a different sign-in method.",
  },
  OAuthCallback: {
    title: "Sign-in was interrupted.",
    description: "Something went wrong while returning from the identity provider.",
    detail: "Try again, or use a different sign-in method.",
  },
  Callback: {
    title: "Sign-in was interrupted.",
    description: "Something went wrong while completing sign-in.",
    detail: "Try again in a moment.",
  },
  CredentialsSignin: {
    title: "Sign-in failed.",
    description: "The email or password didn’t match.",
    detail: "Check your credentials and try again.",
  },
  SessionRequired: {
    title: "Sign in required.",
    description: "You need to sign in to continue.",
    detail: "Return to sign in and try again.",
  },
};

const DEFAULT_COPY = {
  title: "Something went wrong.",
  description: "We couldn’t complete sign-in.",
  detail: "Try again, or return to the sign-in page.",
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") ?? undefined;
  const providerParam = searchParams.get("provider") ?? undefined;
  const fromParam = searchParams.get("from") ?? undefined;
  const provider = isOAuthProviderId(providerParam) ? providerParam : undefined;
  const from = safeAuthReturnPath(fromParam);
  const sessionQuery = useRawQuery<{ user?: { email?: string | null } }>(["auth", "session"], "/api/auth/session", { enabled: error === "OAuthAccountNotLinked" });
  const session = sessionQuery.data;
  const providerLabel = provider ? OAUTH_PROVIDER_LABELS[provider] : "OAuth";

  if (error === "OAuthAccountNotLinked") {
    const signedInEmail = session?.user?.email;
    const signedIn = Boolean(session?.user);

    return (
      <AuthShell
        size="md"
        accent="cyan"
        contentAlign="top"
        title={
          signedIn
            ? "You’re signed in to a different account."
            : "This email already has an account."
        }
        description={
          signedIn
            ? `That ${providerLabel} sign-in belongs to another UseJunction user.`
            : `The ${providerLabel} sign-in isn’t linked to this UseJunction account.`
        }
        statement="Visibility before control."
      >
        <Alert variant="destructive">
          <AlertDescription>
            {signedIn
              ? `${signedInEmail ? `You’re currently signed in as ${signedInEmail}. ` : ""}To switch accounts, sign out first. No account links were changed.`
              : "For your security, we didn’t link the accounts automatically. Sign in with the method you originally used, or reset your password if you registered with email."}
          </AlertDescription>
        </Alert>
        <OAuthAccountConflictActions
          callbackUrl={from}
          provider={provider}
          signedIn={signedIn}
        />
      </AuthShell>
    );
  }

  const copy = (error && ERROR_COPY[error]) || DEFAULT_COPY;

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      title={copy.title}
      description={copy.description}
      statement="Visibility before control."
    >
      <Alert variant="destructive">
        <AlertDescription>{copy.detail}</AlertDescription>
      </Alert>
      <a href="/login" className="mt-6 block text-center text-sm text-muted-foreground !underline underline-offset-4">
        Back to sign in
      </a>
    </AuthShell>
  );
}
