import { prisma, type Prisma } from "@usejunction/db";
import { linkDeveloperToUser, normalizeEmail } from "@/lib/developer-identity";
import { syncTeamSeatQuantityBestEffort } from "@/lib/saas-billing/quantity";

export async function acceptWorkspaceInvite(params: {
  tx?: Prisma.TransactionClient;
  orgId: string;
  userId: string;
  email: string;
  name?: string | null;
  role: string;
  source?: string;
}): Promise<{ developerId: string }> {
  const db = params.tx ?? prisma;
  const email = normalizeEmail(params.email);

  await db.organizationMembership.upsert({
    where: { userId_orgId: { userId: params.userId, orgId: params.orgId } },
    update: { role: params.role },
    create: { userId: params.userId, orgId: params.orgId, role: params.role },
  });

  const linked = await linkDeveloperToUser({
    tx: db,
    orgId: params.orgId,
    userId: params.userId,
    email,
    name: params.name,
    role: params.role,
  });

  await syncTeamSeatQuantityBestEffort(params.orgId, params.source ?? "workspace.joined");

  return { developerId: linked.id };
}
