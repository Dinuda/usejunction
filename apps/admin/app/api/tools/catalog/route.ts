import { NextRequest, NextResponse } from "next/server";
import { requireOrgRole } from "@/lib/rbac";
import { serializeCatalog } from "@/lib/tools/catalog";

export async function GET(req: NextRequest) {
  const auth = await requireOrgRole(req, ["owner", "admin"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ tools: serializeCatalog(), version: "2026-07-10" });
}
