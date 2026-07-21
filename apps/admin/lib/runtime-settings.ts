import { prisma } from "@usejunction/db";

export const FULL_USAGE_RESCAN_DAY_KEY = "fullUsageRescanDay";

/** Persist the UTC YYYY-MM-DD sealed by the daily usage refresh cron. */
export async function setFullUsageRescanDay(day: string): Promise<string> {
  const value = day.trim();
  await prisma.appRuntimeSetting.upsert({
    where: { key: FULL_USAGE_RESCAN_DAY_KEY },
    create: { key: FULL_USAGE_RESCAN_DAY_KEY, value },
    update: { value },
  });
  return value;
}

/** Read the sealed full-usage rescan day, or null when unset. */
export async function getFullUsageRescanDay(): Promise<string | null> {
  const row = await prisma.appRuntimeSetting.findUnique({
    where: { key: FULL_USAGE_RESCAN_DAY_KEY },
    select: { value: true },
  });
  const value = row?.value?.trim();
  return value || null;
}

/** Current UTC calendar day as YYYY-MM-DD. */
export function utcDayString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
