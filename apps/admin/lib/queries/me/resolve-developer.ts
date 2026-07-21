import { prisma } from "@usejunction/db";

/** Resolve the linked Developer.id for an auth user in an org, or null if unlinked. */
export async function resolveLinkedDeveloperId(
  orgId: string,
  authUserId: string,
): Promise<string | null> {
  const developer = await prisma.developer.findFirst({
    where: { orgId, authUserId },
    select: { id: true },
  });
  return developer?.id ?? null;
}
