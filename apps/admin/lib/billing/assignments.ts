import { prisma, Prisma } from "@usejunction/db";

type AssignmentDb = typeof prisma | Prisma.TransactionClient;

export async function findOverlap(input: {
  orgId: string;
  developerId: string;
  provider: string;
  product: string;
  toolName: string;
  startDate: Date;
  endDate?: Date | null;
  excludeId?: string;
}, db: AssignmentDb = prisma) {
  return db.developerPlanAssignment.findFirst({
    where: {
      orgId: input.orgId,
      developerId: input.developerId,
      provider: input.provider,
      product: input.product,
      toolName: input.toolName,
      active: true,
      ...(input.excludeId ? { NOT: { id: input.excludeId } } : {}),
      ...(input.endDate ? { startDate: { lt: input.endDate } } : {}),
      OR: [{ endDate: null }, { endDate: { gt: input.startDate } }],
    },
    select: { id: true, startDate: true, endDate: true },
  });
}

export class SeatCapacityError extends Error {
  constructor(public availableSeats: number, public requestedSeats: number) {
    super("NO_SEATS_AVAILABLE");
  }
}

export class AssignmentOverlapError extends Error {
  constructor(public developerId: string, public conflict: { id: string; startDate: Date; endDate: Date | null }) {
    super("ASSIGNMENT_OVERLAP");
  }
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("transaction retry exhausted");
}

export async function assignSubscriptionSeats(input: {
  orgId: string;
  developerIds: string[];
  planTemplateId: string;
  startDate: Date;
  endDate?: Date | null;
  seatCount: number;
  seatStatus: string;
  toolName?: string;
  notes?: string | null;
  vendorAccountEmailByDeveloper: Map<string, string | null>;
  createdByUserId: string;
  overrides: Parameters<typeof assignmentSnapshot>[1];
}) {
  return serializable(async (tx) => {
    const developers = await tx.developer.findMany({
      where: { orgId: input.orgId, id: { in: input.developerIds } },
      select: { id: true },
    });
    if (developers.length !== input.developerIds.length) throw new Error("DEVELOPER_NOT_FOUND");
    const template = await tx.billingPlanTemplate.findFirst({ where: { id: input.planTemplateId, orgId: input.orgId, active: true } });
    if (!template) throw new Error("SUBSCRIPTION_NOT_FOUND");
    const aggregate = await tx.developerPlanAssignment.aggregate({
      where: { orgId: input.orgId, planTemplateId: template.id, active: true, seatStatus: "active" },
      _sum: { seatCount: true },
    });
    const assignedSeats = aggregate._sum.seatCount ?? 0;
    const requestedSeats = input.seatStatus === "active" ? input.seatCount * input.developerIds.length : 0;
    const availableSeats = Math.max(0, template.seatCapacity - assignedSeats);
    if (requestedSeats > availableSeats) throw new SeatCapacityError(availableSeats, requestedSeats);
    const snapshot = assignmentSnapshot(template, input.overrides);
    const toolName = input.toolName ?? snapshot.toolName;
    for (const developerId of input.developerIds) {
      const overlap = await findOverlap({ orgId: input.orgId, developerId, provider: snapshot.provider, product: snapshot.product, toolName, startDate: input.startDate, endDate: input.endDate }, tx);
      if (overlap) throw new AssignmentOverlapError(developerId, overlap);
    }
    const assignments = [];
    for (const developerId of input.developerIds) {
      assignments.push(await tx.developerPlanAssignment.create({
        data: {
          ...snapshot,
          toolName,
          orgId: input.orgId,
          developerId,
          planTemplateId: template.id,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          seatCount: input.seatCount,
          seatStatus: input.seatStatus,
          source: "admin_confirmed",
          vendorAccountEmail: input.vendorAccountEmailByDeveloper.get(developerId) ?? null,
          notes: input.notes ?? null,
          createdByUserId: input.createdByUserId,
        },
      }));
    }
    return { assignments, template };
  });
}

export function assignmentSnapshot(template: {
  provider: string;
  product: string;
  toolName: string;
  name: string;
  tier: string | null;
  currency: string;
  billingCadence: string;
  billingCycleAnchorDate: Date | null;
  billingCycleDays: number | null;
  cycleSeatMicros: bigint;
  includedCycleMicros: bigint;
  inputRateMicrosPerMillion: bigint;
  outputRateMicrosPerMillion: bigint;
  cacheRateMicrosPerMillion: bigint;
  billingOwner: string | null;
  externalReference: string | null;
}, overrides: {
  cycleSeatMicros?: bigint;
  includedCycleMicros?: bigint;
  inputRateMicrosPerMillion?: bigint;
  outputRateMicrosPerMillion?: bigint;
  cacheRateMicrosPerMillion?: bigint;
}) {
  return {
    provider: template.provider,
    product: template.product,
    toolName: template.toolName,
    planName: template.name,
    planTier: template.tier,
    currency: template.currency,
    billingCadence: template.billingCadence,
    billingCycleAnchorDate: template.billingCycleAnchorDate,
    billingCycleDays: template.billingCycleDays,
    cycleSeatMicros: overrides.cycleSeatMicros ?? template.cycleSeatMicros,
    includedCycleMicros: overrides.includedCycleMicros ?? template.includedCycleMicros,
    inputRateMicrosPerMillion: overrides.inputRateMicrosPerMillion ?? template.inputRateMicrosPerMillion,
    outputRateMicrosPerMillion: overrides.outputRateMicrosPerMillion ?? template.outputRateMicrosPerMillion,
    cacheRateMicrosPerMillion: overrides.cacheRateMicrosPerMillion ?? template.cacheRateMicrosPerMillion,
    billingOwner: template.billingOwner,
    externalReference: template.externalReference,
  };
}
