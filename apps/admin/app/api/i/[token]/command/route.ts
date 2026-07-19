import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@usejunction/db";
import { buildInstallCommand, buildWindowsInstallCommand, getPublicAppUrl } from "@/lib/connect-command";
import { hasVerifiedIdentity, normalizeEmail } from "@/lib/developer-identity";
import { generateOpaqueToken, hashOpaqueToken } from "@/lib/security";

/**
 * Downloads a macOS .command file by default, or a PowerShell launcher when
 * platform=windows.
 * Re-mints a fresh enrollment token so the download is always usable after redeem.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  if (!(await hasVerifiedIdentity(session.user.id))) {
    return NextResponse.json({ error: "verified identity required" }, { status: 403 });
  }

  const { token } = await params;
  const link = await prisma.teamInviteLink.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
  });
  if (!link || !link.enabled) {
    return NextResponse.json({ error: "invite link not found" }, { status: 404 });
  }
  if (link.expiresAt && link.expiresAt <= new Date()) {
    return NextResponse.json({ error: "invite link expired" }, { status: 410 });
  }

  const sessionEmail = normalizeEmail(session.user.email);

  const developer = await prisma.developer.findUnique({
    where: { orgId_email: { orgId: link.orgId, email: sessionEmail } },
  });
  if (!developer) {
    return NextResponse.json(
      { error: "Redeem the invite in the browser first, then download the installer." },
      { status: 400 },
    );
  }

  const enrollmentToken = generateOpaqueToken("uj_enroll", 32);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.enrollmentToken.deleteMany({ where: { developerId: developer.id, usedAt: null } });
    await tx.enrollmentToken.create({
      data: {
        orgId: link.orgId,
        teamId: developer.teamId,
        developerId: developer.id,
        tokenHash: hashOpaqueToken(enrollmentToken),
        expiresAt,
      },
    });
  });

  const base = getPublicAppUrl();
  const installCommand = buildInstallCommand(enrollmentToken, base);
  if (req.nextUrl.searchParams.get("platform") === "windows") {
    const windowsCommand = buildWindowsInstallCommand(enrollmentToken, base);
    const script = [
      "$ErrorActionPreference = \"Stop\"",
      "Write-Host \"Installing UseJunction agent...\"",
      windowsCommand,
      "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
      "Write-Host \"Done. You can close this window.\"",
      "",
    ].join("\r\n");
    return new NextResponse(script, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'attachment; filename="install-usejunction.ps1"',
        "cache-control": "no-store",
        "x-enrollment-expires-at": expiresAt.toISOString(),
      },
    });
  }
  const script = [
    "#!/bin/bash",
    "set -euo pipefail",
    'cd "$(dirname "$0")" 2>/dev/null || true',
    `echo "Installing UseJunction agent…"`,
    installCommand,
    'echo ""',
    'echo "Done. You can close this window."',
    "read -r -p \"Press Enter to close…\" _ || true",
    "",
  ].join("\n");

  return new NextResponse(script, {
    status: 200,
    headers: {
      "content-type": "application/x-shellscript",
      "content-disposition": 'attachment; filename="install-usejunction.command"',
      "cache-control": "no-store",
      "x-enrollment-expires-at": expiresAt.toISOString(),
    },
  });
}
