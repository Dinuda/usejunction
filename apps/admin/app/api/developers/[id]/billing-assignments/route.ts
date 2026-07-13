import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { assignmentSchema, serializeBigInts } from "@/lib/billing/validation";
import { AssignmentOverlapError, SeatCapacityError, assignSubscriptionSeats } from "@/lib/billing/assignments";
import { requireOrgRole, audit } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id: developerId } = await params;
  const developer = await prisma.developer.findFirst({ where: { id: developerId, orgId: auth.orgId }, select: { id: true } });
  if (!developer) return NextResponse.json({ error: "developer not found" }, { status: 404 });
  const assignments = await prisma.developerPlanAssignment.findMany({ where: { orgId: auth.orgId, developerId }, orderBy: [{ active: "desc" }, { startDate: "desc" }] });
  return NextResponse.json(serializeBigInts({ assignments }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id: developerId } = await params;
  const parsed = assignmentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid plan assignment", details: parsed.error.flatten() }, { status: 400 });
  const developer = await prisma.developer.findFirst({ where: { id: developerId, orgId: auth.orgId }, select: { id: true, email: true } });
  if (!developer) return NextResponse.json({ error: "developer not found" }, { status: 404 });
  let result;
  try {
    result = await assignSubscriptionSeats({
      orgId: auth.orgId,
      developerIds: [developerId],
      planTemplateId: parsed.data.planTemplateId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      seatCount: parsed.data.seatCount,
      seatStatus: parsed.data.seatStatus,
      toolName: parsed.data.toolName,
      notes: parsed.data.notes,
      vendorAccountEmailByDeveloper: new Map([[developerId, parsed.data.vendorAccountEmail ?? developer.email]]),
      createdByUserId: auth.userId,
      overrides: parsed.data,
    });
  } catch (error) {
    if (error instanceof SeatCapacityError) return NextResponse.json({ error: "no seats available", availableSeats: error.availableSeats, requestedSeats: error.requestedSeats }, { status: 409 });
    if (error instanceof AssignmentOverlapError) return NextResponse.json({ error: "overlapping active assignment", conflict: error.conflict }, { status: 409 });
    if (error instanceof Error && error.message === "SUBSCRIPTION_NOT_FOUND") return NextResponse.json({ error: "active subscription not found" }, { status: 404 });
    throw error;
  }
  const assignment = result.assignments[0];
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.assignment_created", targetType: "developer_plan_assignment", targetId: assignment.id, metadata: { developerId, planTemplateId: result.template.id } });
  return NextResponse.json(serializeBigInts({ assignment }), { status: 201 });
}
