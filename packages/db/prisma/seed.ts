import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: {
      id: "seed-org",
      name: "Demo Engineering",
    },
  });

  const team = await prisma.team.upsert({
    where: { id: "seed-team" },
    update: {},
    create: {
      id: "seed-team",
      orgId: org.id,
      name: "Platform",
    },
  });

  const users = await Promise.all(
    [
      { name: "Dinuda", email: "dinuda@example.com" },
      { name: "Alex", email: "alex@example.com" },
    ].map((u) =>
      prisma.user.upsert({
        where: { orgId_email: { orgId: org.id, email: u.email } },
        update: {},
        create: {
          orgId: org.id,
          teamId: team.id,
          name: u.name,
          email: u.email,
          role: "developer",
        },
      })
    )
  );

  // Stable demo token so Docker restarts stay usable in local/dev.
  const rawToken =
    process.env.DEMO_ENROLLMENT_TOKEN ??
    `uj_enroll_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.enrollmentToken.upsert({
    where: { tokenHash },
    update: {
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usedAt: null,
    },
    create: {
      orgId: org.id,
      teamId: team.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Seed complete.");
  console.log("Demo enrollment token (save this):", rawToken);
  console.log(
    "Users:",
    users.map((u) => u.email).join(", ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
