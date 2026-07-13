import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "seed-org" },
    update: {},
    create: {
      id: "seed-org",
      name: "Demo Engineering",
      plan: "trial",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
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

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin";
  const authUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { emailVerified: new Date(), passwordHash: await hash(adminPassword, 12) },
    create: { name: "Admin", email: adminEmail, emailVerified: new Date(), passwordHash: await hash(adminPassword, 12) },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_orgId: { userId: authUser.id, orgId: org.id } },
    update: { role: "owner", onboardingCompletedAt: new Date() },
    create: { userId: authUser.id, orgId: org.id, role: "owner", onboardingCompletedAt: new Date() },
  });

  const users = await Promise.all(
    [
      { name: "Admin", email: adminEmail, authUserId: authUser.id },
      { name: "Alex", email: "alex@example.com" },
    ].map((u) =>
      prisma.developer.upsert({
        where: { orgId_email: { orgId: org.id, email: u.email } },
        update: { ...(u.authUserId ? { authUserId: u.authUserId, role: "owner" } : {}) },
        create: {
          orgId: org.id,
          teamId: team.id,
          name: u.name,
          email: u.email,
          role: u.authUserId ? "owner" : "developer",
          authUserId: u.authUserId,
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
      developerId: users[0].id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
    },
    create: {
      orgId: org.id,
      teamId: team.id,
      developerId: users[0].id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
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
