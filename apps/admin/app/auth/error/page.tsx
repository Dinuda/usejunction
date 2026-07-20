import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Sign-in error",
  robots: { index: false, follow: false },
};

const ERROR_COPY: Record<string, { title: string; description: string; detail: string }> = {
  Configuration: {
    title: "Sign-in isn’t available.",
    description: "There’s a problem with the authentication configuration.",
    detail: "Check the server logs for more information, or try again later.",
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

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const copy = (error && ERROR_COPY[error]) || DEFAULT_COPY;

  return (
    <AuthShell
      size="md"
      accent="cyan"
      contentAlign="top"
      eyebrow="Auth"
      title={copy.title}
      description={copy.description}
      statement="Visibility before control."
    >
      <Alert variant="destructive">
        <AlertDescription>{copy.detail}</AlertDescription>
      </Alert>
      <a href="/login" className="mt-6 block text-sm text-muted-foreground underline underline-offset-4">
        Back to sign in
      </a>
    </AuthShell>
  );
}
