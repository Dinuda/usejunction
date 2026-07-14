import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

async function readInstallScript() {
  const candidates = [
    path.join(process.cwd(), "install.sh"),
    path.join(process.cwd(), "..", "install.sh"),
    path.join(process.cwd(), "..", "..", "install.sh"),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET() {
  const body = await readInstallScript();
  if (!body) return NextResponse.json({ error: "install.sh not found" }, { status: 404 });
  return new NextResponse(body, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
