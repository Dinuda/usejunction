import { NextResponse } from "next/server";
import { prisma } from "@usejunction/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const release = await prisma.agentRelease.findFirst({
    where: { status: { in: ["active", "superseded"] } },
    orderBy: { rolloutStartedAt: "desc" },
  });
  if (!release) return NextResponse.json({ error: "no active release" }, { status: 404 });
  return NextResponse.json(
    { releaseId: release.id, status: release.status, manifest: release.manifest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
