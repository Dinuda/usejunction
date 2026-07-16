import { Prisma, prisma } from "@usejunction/db";

export class AuthUserNotFoundError extends Error {
  constructor(message = "Signed-in user record is missing or invalid.") {
    super(message);
    this.name = "AuthUserNotFoundError";
  }
}

export type AuthUserInput = {
  id: string;
  email: string;
  name?: string | null;
};

type ResolvedAuthUser = {
  id: string;
  email: string;
  name: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Maps a session identity to a persisted auth_users row.
 * Reconciles stale JWT user ids when the email still matches an existing account.
 */
export async function resolveAuthUser(input: AuthUserInput): Promise<ResolvedAuthUser> {
  const email = normalizeEmail(input.email);
  if (!input.id || !email) {
    throw new AuthUserNotFoundError();
  }

  const byId = await prisma.user.findUnique({
    where: { id: input.id },
    select: { id: true, email: true, name: true },
  });
  if (byId) {
    if (normalizeEmail(byId.email) !== email) {
      throw new AuthUserNotFoundError("Signed-in identity does not match the stored account.");
    }
    return byId;
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (byEmail) {
    return byEmail;
  }

  throw new AuthUserNotFoundError();
}

export function isAuthUserNotFoundError(error: unknown): error is AuthUserNotFoundError {
  return error instanceof AuthUserNotFoundError;
}

export function isMissingAuthUserPrismaError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
