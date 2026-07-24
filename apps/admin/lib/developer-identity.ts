import { prisma, type Prisma } from "@usejunction/db";

const OAUTH_PROVIDERS = new Set(["google", "microsoft-entra-id", "github"]);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export type IdentityVerificationStatus =
  | { verified: true }
  | { verified: false; status: 401; error: string }
  | { verified: false; status: 403; error: string };

export async function getIdentityVerificationStatus(userId: string): Promise<IdentityVerificationStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, accounts: { select: { provider: true } } },
  });
  if (!user) {
    return { verified: false, status: 401, error: "session expired, sign in again" };
  }
  if (user.emailVerified) return { verified: true };
  if (user.accounts.some((account) => OAUTH_PROVIDERS.has(account.provider))) {
    return { verified: true };
  }
  return { verified: false, status: 403, error: "verify your email to continue" };
}

export async function hasVerifiedIdentity(userId: string) {
  return (await getIdentityVerificationStatus(userId)).verified;
}

export async function linkDeveloperToUser(input: {
  tx: Prisma.TransactionClient;
  orgId: string;
  userId: string;
  email: string;
  name?: string | null;
  role?: string;
}) {
  const email = normalizeEmail(input.email);
  const existingByUser = await input.tx.developer.findFirst({
    where: { orgId: input.orgId, authUserId: input.userId },
  });
  if (existingByUser) {
    if (!existingByUser.removedAt) return existingByUser;
    return input.tx.developer.update({
      where: { id: existingByUser.id },
      data: {
        removedAt: null,
        name: input.name?.trim() || undefined,
        ...(input.role ? { role: input.role } : {}),
      },
    });
  }

  return input.tx.developer.upsert({
    where: { orgId_email: { orgId: input.orgId, email } },
    update: {
      authUserId: input.userId,
      removedAt: null,
      name: input.name?.trim() || undefined,
      ...(input.role ? { role: input.role } : {}),
    },
    create: {
      orgId: input.orgId,
      authUserId: input.userId,
      email,
      name: input.name?.trim() || email.split("@")[0],
      role: input.role ?? "user",
    },
  });
}
