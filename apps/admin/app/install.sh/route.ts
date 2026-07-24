import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

type InstallScript = {
  body: string;
  root: string;
};

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function readInstallScript(): Promise<InstallScript | null> {
  const candidates = [
    path.join(process.cwd(), "install.sh"),
    path.join(process.cwd(), "..", "install.sh"),
    path.join(process.cwd(), "..", "..", "install.sh"),
  ];
  for (const candidate of candidates) {
    try {
      const body = await readFile(candidate, "utf8");
      return {
        body,
        root: path.dirname(candidate),
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(request: Request) {
  const found = await readInstallScript();
  if (!found) return NextResponse.json({ error: "install.sh not found" }, { status: 404 });

  let body = found.body;
  // When developers curl the local admin install.sh, inject the monorepo root so
  // the customer-facing installer builds from this checkout instead of falling
  // back to an ancient GitHub agent-v0.1.0 release. Production hosts are untouched.
  const hostname = new URL(request.url).hostname;
  if (isLoopbackHost(hostname) && found.root) {
    body = [
      "# Injected by local control plane — build agent from this checkout.",
      `export USEJUNCTION_ROOT=${shellSingleQuote(found.root)}`,
      "",
      found.body,
    ].join("\n");
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
