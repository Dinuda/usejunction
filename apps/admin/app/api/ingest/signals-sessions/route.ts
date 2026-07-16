import { NextRequest, NextResponse } from "next/server";
import { prisma, type Prisma } from "@usejunction/db";
import { bearerToken } from "@/lib/auth";
import {
  containsForbiddenSignalsField,
  normalizeDomain,
  signalsIngestSchema,
  type SignalsSessionInput,
} from "@/lib/signals/contracts";
import { enforceSignalsRetention, getEffectiveSignalsPolicy } from "@/lib/signals/service";

function asDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value: string | null | undefined, max = 128): string | null {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : null;
}

function cleanSession(row: SignalsSessionInput) {
  const startedAt = asDate(row.startedAt);
  const endedAt = asDate(row.endedAt);
  if (!startedAt || !endedAt || endedAt <= startedAt) return null;

  const steps = row.steps.map((step) => ({
    app: cleanText(step.app),
    domain: normalizeDomain(step.domain),
    startedAt: step.startedAt,
    endedAt: step.endedAt,
  }));

  return {
    localId: row.localId,
    startedAt,
    endedAt,
    durationSeconds: row.durationSeconds,
    aiTool: cleanText(row.aiTool, 128) ?? "unknown",
    appBefore: cleanText(row.appBefore),
    domainBefore: normalizeDomain(row.domainBefore),
    appAfter: cleanText(row.appAfter),
    domainAfter: normalizeDomain(row.domainAfter),
    flowSignature: cleanText(row.flowSignature, 255) ?? "unknown",
    confidence: row.confidence,
    collectionMode: row.collectionMode,
    steps: steps as Prisma.InputJsonValue,
    metadata: (row.metadata ?? {}) as Prisma.InputJsonValue,
  };
}

function sessionTouchesExcluded(
  session: ReturnType<typeof cleanSession> & {},
  excludedApps: string[],
  excludedDomains: string[],
) {
  if (!session) return true;
  const apps = new Set(excludedApps.map((item) => item.toLowerCase()));
  const domains = new Set(excludedDomains.map((item) => item.toLowerCase()));
  const values = [
    session.appBefore,
    session.appAfter,
    ...((session.steps as Array<{ app?: string | null }>) ?? []).map((step) => step.app ?? null),
  ].filter(Boolean).map((item) => String(item).toLowerCase());
  const domainValues = [
    session.domainBefore,
    session.domainAfter,
    ...((session.steps as Array<{ domain?: string | null }>) ?? []).map((step) => step.domain ?? null),
  ].filter(Boolean).map((item) => String(item).toLowerCase());
  return values.some((app) => apps.has(app)) || domainValues.some((domain) => domains.has(domain));
}

export async function POST(req: NextRequest) {
  try {
    const token = bearerToken(req);
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const device = await prisma.device.findUnique({
      where: { deviceToken: token },
      include: { user: { select: { teamId: true } } },
    });
    if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const policy = await getEffectiveSignalsPolicy(device.orgId, device.user.teamId);
    if (!policy.enabled) return NextResponse.json({ error: "signals disabled" }, { status: 403 });

    const body = await req.json();
    const forbidden = containsForbiddenSignalsField(body);
    if (forbidden) {
      return NextResponse.json({ error: "forbidden signals field", field: forbidden }, { status: 400 });
    }
    const parsed = signalsIngestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid signals payload", details: parsed.error.flatten() }, { status: 400 });
    }

    let upserted = 0;
    let skipped = 0;
    for (const input of parsed.data.sessions) {
      const session = cleanSession(input);
      if (!session || sessionTouchesExcluded(session, policy.excludedApps, policy.excludedDomains)) {
        skipped += 1;
        continue;
      }

      await prisma.signalsSession.upsert({
        where: { deviceId_localId: { deviceId: device.id, localId: session.localId } },
        update: {
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.durationSeconds,
          aiTool: session.aiTool,
          appBefore: session.appBefore,
          domainBefore: session.domainBefore,
          appAfter: session.appAfter,
          domainAfter: session.domainAfter,
          flowSignature: session.flowSignature,
          confidence: session.confidence,
          collectionMode: session.collectionMode,
          steps: session.steps,
          metadata: session.metadata,
        },
        create: {
          orgId: device.orgId,
          developerId: device.userId,
          deviceId: device.id,
          ...session,
        },
      });

      if (policy.storeEvents) {
        const steps = session.steps as Array<{ app?: string | null; domain?: string | null; startedAt: string }>;
        for (const [index, step] of steps.entries()) {
          const observedAt = asDate(step.startedAt);
          if (!observedAt) continue;
          await prisma.signalsActivityEvent.upsert({
            where: { deviceId_localId: { deviceId: device.id, localId: `${session.localId}:${index}` } },
            update: {
              observedAt,
              app: step.app ?? null,
              domain: normalizeDomain(step.domain),
              eventType: "foreground_segment",
              collectionMode: session.collectionMode,
            },
            create: {
              orgId: device.orgId,
              developerId: device.userId,
              deviceId: device.id,
              localId: `${session.localId}:${index}`,
              observedAt,
              app: step.app ?? null,
              domain: normalizeDomain(step.domain),
              eventType: "foreground_segment",
              collectionMode: session.collectionMode,
            },
          });
        }
      }

      upserted += 1;
    }

    if (upserted > 0) {
      await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), status: "online" } });
      await enforceSignalsRetention(device.orgId, policy.retentionDays);
    }

    return NextResponse.json({ upserted, skipped });
  } catch (e) {
    console.error("[ingest/signals-sessions]", e);
    return NextResponse.json({ error: "signals ingest failed" }, { status: 500 });
  }
}
