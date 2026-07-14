import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit, requireOrgRole } from "@/lib/rbac";
import { serializeBigInts } from "@/lib/billing/validation";
import { applyDetectedPlanForDeveloper } from "@/lib/tools/sync-detected";

const bodySchema = z.object({
  developerId: z.string().trim().min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ toolKey: string }> }) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  const { toolKey } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "developerId required" }, { status: 400 });
  }

  try {
    const result = await applyDetectedPlanForDeveloper({
      orgId: auth.orgId,
      developerId: parsed.data.developerId,
      toolKey,
      actorUserId: auth.userId,
    });
    await audit({
      orgId: auth.orgId,
      actorType: "user",
      actorId: auth.userId,
      action: "tools.detected_plan_applied",
      targetType: "developer",
      targetId: parsed.data.developerId,
      metadata: { toolKey, catalogPlanKey: result.catalogPlanKey, migrated: result.migrated },
    });
    return NextResponse.json(serializeBigInts({ result }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPLY_FAILED";
    const labels: Record<string, { status: number; error: string }> = {
      CATALOG_TOOL_NOT_FOUND: { status: 404, error: "tool not found in catalog" },
      VENDOR_PLAN_NOT_FOUND: { status: 404, error: "no vendor plan detected for this developer" },
      ADMIN_ASSIGNMENT_LOCKED: { status: 409, error: "admin-confirmed assignment cannot be auto-updated" },
    };
    const mapped = labels[message];
    if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    console.error("POST /api/tools/[toolKey]/apply-detected", error);
    return NextResponse.json({ error: "could not apply detected plan" }, { status: 500 });
  }
}
