import { prisma, type Prisma } from "@usejunction/db";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hasVerifiedIdentity(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, accounts: { select: { provider: true } } },
  });
  if (!user) return false;
  if (user.emailVerified) return true;
  return user.accounts.some((account) => ["google", "microsoft-entra-id", "github"].includes(account.provider));
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
  if (existingByUser) return existingByUser;

  return input.tx.developer.upsert({
    where: { orgId_email: { orgId: input.orgId, email } },
    update: { authUserId: input.userId, name: input.name?.trim() || undefined },
    create: {
      orgId: input.orgId,
      authUserId: input.userId,
      email,
      name: input.name?.trim() || email.split("@")[0],
      role: input.role ?? "developer",
    },
  });
}
