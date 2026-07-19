import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

async function readInstallScript() {
  const candidates = [
    path.join(process.cwd(), "install.ps1"),
    path.join(process.cwd(), "..", "install.ps1"),
    path.join(process.cwd(), "..", "..", "install.ps1"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the next standalone/monorepo location.
    }
  }
  return null;
}

export async function GET() {
  const body = await readInstallScript();
  if (!body) return NextResponse.json({ error: "install.ps1 not found" }, { status: 404 });
  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
