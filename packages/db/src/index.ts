import { PrismaClient } from "@prisma/client";

/**
 * Bump when Device (or other hot models) gain fields so a long-lived Next.js
 * process drops a stale PrismaClient after `prisma generate`.
 */
const PRISMA_SCHEMA_REV = "agent-updates-v1";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaRev?: string;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma && globalForPrisma.prismaSchemaRev === PRISMA_SCHEMA_REV) {
    return globalForPrisma.prisma;
  }
  if (globalForPrisma.prisma) {
    void globalForPrisma.prisma.$disconnect().catch(() => undefined);
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaSchemaRev = PRISMA_SCHEMA_REV;
  }
  return client;
}

export const prisma = getPrisma();

export { Prisma, PrismaClient } from "@prisma/client";

export type {
  Account,
  AgentRelease,
  AgentUpdateDeployment,
  AgentUpdateEvent,
  AnalyticsQueryCache,
  AuditLog,
  AuthActionToken,
  BillingPlanTemplate,
  ConnectInvite,
  Developer,
  DeveloperPlanAssignment,
  DeveloperToolClaim,
  Device,
  EnrollmentToken,
  ExternalIdentity,
  LocalModel,
  LocalUsageAggregate,
  Organization,
  OrganizationDomain,
  OrganizationInvite,
  OrganizationMembership,
  PlanInterest,
  ProviderConnection,
  ProviderSyncRun,
  QuotaSnapshot,
  Repository,
  RequestMetadata,
  SeatAssignment,
  Session,
  SignalsActivityEvent,
  SignalsPolicy,
  SignalsSession,
  Team,
  TeamInviteAllowlist,
  TeamInviteLink,
  TelemetryEndpoint,
  ToolAccount,
  ToolInstallation,
  UsageDaily,
  User,
  VerificationToken,
} from "@prisma/client";
