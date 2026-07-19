import { prisma } from "@usejunction/db";
import { activeDevicesForOrg } from "@/lib/devices/decommission";

export async function readDeviceCoverage(orgId: string) {
  const active = activeDevicesForOrg(orgId);
  const devices = await prisma.device.count({ where: active });
  return { devices };
}
