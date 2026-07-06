import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";

async function getDevice(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  return prisma.device.findUnique({ where: { deviceToken: token } });
}

export async function POST(req: NextRequest) {
  const device = await getDevice(req);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  await prisma.device.update({
    where: { id: device.id },
    data: {
      lastSeenAt: new Date(),
      status: "online",
      agentVersion: body.agentVersion || device.agentVersion,
      os: body.os || device.os,
      architecture: body.architecture || device.architecture,
      hostname: body.hostname || device.hostname,
    },
  });

  return NextResponse.json({ ok: true });
}
