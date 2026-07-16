import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { assignmentUpdateSchema, serializeBigInts } from "@/lib/billing/validation";
import { assignmentSnapshot, findOverlap } from "@/lib/billing/assignments";
import { requireOrgRole, audit } from "@/lib/rbac";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id: developerId, assignmentId } = await params;
  const parsed = assignmentUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid plan assignment", details: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.developerPlanAssignment.findFirst({ where: { id: assignmentId, orgId: auth.orgId, developerId, active: true } });
  if (!existing) return NextResponse.json({ error: "assignment not found" }, { status: 404 });
  const templateId = parsed.data.planTemplateId ?? existing.planTemplateId;
  const template = await prisma.billingPlanTemplate.findFirst({ where: { id: templateId, orgId: auth.orgId, active: true } });
  if (!template) return NextResponse.json({ error: "active plan template not found" }, { status: 404 });
  const snapshot = assignmentSnapshot(template, parsed.data.planTemplateId
    ? parsed.data
    : {
        cycleSeatMicros: parsed.data.cycleSeatMicros ?? existing.cycleSeatMicros,
        includedCycleMicros: parsed.data.includedCycleMicros ?? existing.includedCycleMicros,
        inputRateMicrosPerMillion: parsed.data.inputRateMicrosPerMillion ?? existing.inputRateMicrosPerMillion,
        outputRateMicrosPerMillion: parsed.data.outputRateMicrosPerMillion ?? existing.outputRateMicrosPerMillion,
        cacheRateMicrosPerMillion: parsed.data.cacheRateMicrosPerMillion ?? existing.cacheRateMicrosPerMillion,
      });
  if (!parsed.data.planTemplateId) {
    snapshot.planName = existing.planName;
    snapshot.planTier = existing.planTier;
    snapshot.currency = existing.currency;
    snapshot.billingOwner = existing.billingOwner;
    snapshot.billingCadence = existing.billingCadence;
    snapshot.billingCycleAnchorDate = existing.billingCycleAnchorDate;
    snapshot.billingCycleDays = existing.billingCycleDays;
    snapshot.externalReference = existing.externalReference;
  }
  const startDate = parsed.data.startDate ?? existing.startDate;
  const endDate = parsed.data.endDate === undefined ? existing.endDate : parsed.data.endDate;
  const toolName = parsed.data.toolName ?? (parsed.data.planTemplateId ? snapshot.toolName : existing.toolName);
  if (endDate && endDate <= startDate) return NextResponse.json({ error: "end date must be after start date" }, { status: 400 });
  const overlap = await findOverlap({ orgId: auth.orgId, developerId, provider: snapshot.provider, product: snapshot.product, toolName, startDate, endDate, excludeId: assignmentId });
  if (overlap) return NextResponse.json({ error: "overlapping active assignment", conflict: overlap }, { status: 409 });
  const nextSeatCount = parsed.data.seatCount ?? existing.seatCount;
  const nextSeatStatus = parsed.data.seatStatus ?? existing.seatStatus;
  if (template.id !== existing.planTemplateId || nextSeatCount !== existing.seatCount || nextSeatStatus !== existing.seatStatus) {
    const aggregate = await prisma.developerPlanAssignment.aggregate({
      where: { orgId: auth.orgId, planTemplateId: template.id, active: true, seatStatus: "active", NOT: { id: assignmentId } },
      _sum: { seatCount: true },
    });
    const requested = nextSeatStatus === "active" ? nextSeatCount : 0;
    if ((aggregate._sum.seatCount ?? 0) + requested > template.seatCapacity) return NextResponse.json({ error: "no seats available" }, { status: 409 });
  }
  const assignment = await prisma.developerPlanAssignment.update({ where: { id: assignmentId }, data: { ...snapshot, toolName, planTemplateId: template.id, startDate, endDate, seatCount: nextSeatCount, seatStatus: nextSeatStatus, vendorAccountEmail: parsed.data.vendorAccountEmail === undefined ? existing.vendorAccountEmail : parsed.data.vendorAccountEmail, notes: parsed.data.notes === undefined ? existing.notes : parsed.data.notes } });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.assignment_updated", targetType: "developer_plan_assignment", targetId: assignmentId, metadata: { developerId } });
  return NextResponse.json(serializeBigInts({ assignment }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { id: developerId, assignmentId } = await params;
  const result = await prisma.developerPlanAssignment.updateMany({ where: { id: assignmentId, orgId: auth.orgId, developerId, active: true }, data: { active: false, endDate: new Date() } });
  if (!result.count) return NextResponse.json({ error: "assignment not found" }, { status: 404 });
  await audit({ orgId: auth.orgId, actorType: "user", actorId: auth.userId, action: "billing.assignment_archived", targetType: "developer_plan_assignment", targetId: assignmentId, metadata: { developerId } });
  return NextResponse.json({ ok: true });
}
