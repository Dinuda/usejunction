import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const raw = process.env.DEMO_ENROLLMENT_TOKEN || "uj_enroll_demo_token_change_me";
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const developer = await prisma.developer.findFirst({ where: { email: "admin@example.com" } });
  if (!developer) throw new Error("admin developer missing — run seed first");

  await prisma.enrollmentToken.upsert({
    where: { tokenHash },
    update: {
      developerId: developer.id,
      orgId: developer.orgId,
      teamId: developer.teamId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
    },
    create: {
      orgId: developer.orgId,
      teamId: developer.teamId,
      developerId: developer.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  console.log(JSON.stringify({ token: raw, developerId: developer.id, email: developer.email }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
