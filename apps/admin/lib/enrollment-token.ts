import { Prisma, prisma } from "@usejunction/db";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

const ENROLLMENT_TOKEN_TTL_MS = 15 * 60 * 1000;

export type IssuedEnrollmentToken = {
  token: string;
  expiresAt: Date;
  id: string;
};

type IssueEnrollmentTokenInput = {
  orgId: string;
  developerId: string;
  rotate?: boolean;
  tx?: Prisma.TransactionClient;
};

function findReusableEnrollmentToken(
  tx: Prisma.TransactionClient,
  developerId: string,
  now: Date,
) {
  return tx.enrollmentToken.findFirst({
    where: {
      developerId,
      usedAt: null,
      expiresAt: { gt: now },
      tokenReveal: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      tokenReveal: true,
      expiresAt: true,
    },
  });
}

async function createEnrollmentToken(
  tx: Prisma.TransactionClient,
  input: { orgId: string; developerId: string },
  now: Date,
): Promise<IssuedEnrollmentToken> {
  await tx.enrollmentToken.deleteMany({
    where: { developerId: input.developerId, usedAt: null },
  });

  const token = generateOpaqueToken("uj_enroll", 32);
  const expiresAt = new Date(now.getTime() + ENROLLMENT_TOKEN_TTL_MS);
  const created = await tx.enrollmentToken.create({
    data: {
      orgId: input.orgId,
      developerId: input.developerId,
      tokenHash: hashOpaqueToken(token),
      tokenReveal: token,
      expiresAt,
    },
    select: { id: true },
  });

  return { id: created.id, token, expiresAt };
}

export async function issueEnrollmentToken(
  input: IssueEnrollmentTokenInput,
): Promise<IssuedEnrollmentToken> {
  const now = new Date();
  const rotate = input.rotate ?? false;

  const run = async (tx: Prisma.TransactionClient) => {
    if (!rotate) {
      const existing = await findReusableEnrollmentToken(tx, input.developerId, now);
      if (existing?.tokenReveal) {
        return {
          id: existing.id,
          token: existing.tokenReveal,
          expiresAt: existing.expiresAt,
        };
      }
    }

    return createEnrollmentToken(tx, input, now);
  };

  if (input.tx) return run(input.tx);
  return prisma.$transaction(run);
}
