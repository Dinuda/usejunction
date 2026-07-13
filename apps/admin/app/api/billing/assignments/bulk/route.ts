import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { z } from "zod";
import { assignmentSchema, serializeBigInts } from "@/lib/billing/validation";
import { AssignmentOverlapError, SeatCapacityError, assignSubscriptionSeats } from "@/lib/billing/assignments";
import { requireOrgRole, audit } from "@/lib/rbac";

const bulkSchema = z.object({
  developerIds: z.array(z.string().trim().min(1)).min(1).max(100),
  assignment: assignmentSchema,
});

export async function POST(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const parsed = bulkSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid bulk assignment", details: parsed.error.flatten() }, { status: 400 });
  const developerIds = [...new Set(parsed.data.developerIds)];
  const developers = await prisma.developer.findMany({ where: { orgId: auth.orgId, id: { in: developerIds } }, select: { id: true, email: true } });
  if (developers.length !== developerIds.length) return NextResponse.json({ error: "one or more developers were not found in this organization" }, { status: 404 });
  const input = parsed.data.assignment;
  let result;
  try {
    result = await assignSubscriptionSeats({
      orgId: auth.orgId,
      developerIds,
      planTemplateId: input.planTemplateId,
      startDate: input.startDate,
      endDate: input.endDate,
      seatCount: input.seatCount,
      seatStatus: input.seatStatus,
      toolName: input.toolName,
      notes: input.notes,
      vendorAccountEmailByDeveloper: new Map(developers.map((developer) => [developer.id, input.vendorAccountEmail ?? developer.email])),
      createdByUserId: auth.userId,
      overrides: input,
    });
  } catch (error) {
    if (error instanceof SeatCapacityError) return NextResponse.json({ error: "not enough seats available", availableSeats: error.availableSeats, requestedSeats: error.requestedSeats }, { status: 409 });
    if (error instanceof AssignmentOverlapError) return NextResponse.json({ error: "overlapping active assignment", developerId: error.developerId, conflict: error.conflict }, { status: 409 });
    if (error instanceof Error && error.message === "SUBSCRIPTION_NOT_FOUND") return NextResponse.json({ error: "active subscription not found" }, { status: 404 });
    throw error;
  }
  const { assignments, template } = result;
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.assignments_bulk_created", targetType: "billing_plan_template", targetId: template.id, metadata: { developerIds, count: assignments.length } });
  return NextResponse.json(serializeBigInts({ assignments }), { status: 201 });
}
