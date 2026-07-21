import { prisma } from "@usejunction/db";
import { isValidIanaTimeZone, normalizeTimeZone } from "@/lib/timezone";

export type TimeZoneSource = "browser" | "agent" | "manual";

export async function applyUserTimeZone(input: {
  userId: string;
  timeZone: string;
  source: TimeZoneSource;
  forceManual?: boolean;
}): Promise<{ timeZone: string; updated: boolean; skippedManual?: boolean }> {
  if (!isValidIanaTimeZone(input.timeZone)) {
    throw new Error("Invalid IANA timezone");
  }
  const timeZone = normalizeTimeZone(input.timeZone);
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { timeZone: true, timeZoneManual: true },
  });
  if (!user) throw new Error("User not found");

  if (user.timeZoneManual && input.source !== "manual" && !input.forceManual) {
    return { timeZone: user.timeZone ?? "UTC", updated: false, skippedManual: true };
  }

  const manual = input.source === "manual" || Boolean(input.forceManual);
  if (user.timeZone === timeZone && !manual) {
    return { timeZone, updated: false };
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      timeZone,
      timeZoneSource: input.source,
      ...(manual ? { timeZoneManual: true } : {}),
    },
  });
  return { timeZone, updated: true };
}

export async function getOrCreateNotificationPrefs(userId: string, orgId: string) {
  const existing = await prisma.userNotificationPreference.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (existing) return existing;
  return prisma.userNotificationPreference.create({
    data: {
      userId,
      orgId,
      dailyPersonalEnabled: true,
      dailyOrgEnabled: true,
    },
  });
}
