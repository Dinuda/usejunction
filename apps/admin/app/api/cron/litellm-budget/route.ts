import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@usejunction/db";
import { getDefaultOrgId } from "@/lib/auth";
import { pollLiteLLMBudget } from "@/lib/providers-status";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.INGEST_SECRET;
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const orgId = getDefaultOrgId();
  const info = await pollLiteLLMBudget();
  if (!info) {
    return NextResponse.json({ ok: false, reason: "litellm unreachable" });
  }

  const budget = info?.info?.max_budget ?? info?.max_budget;
  const spend = info?.info?.spend ?? info?.spend;
  let usedPercent: number | null = null;
  if (budget && spend !== undefined) {
    usedPercent = (spend / budget) * 100;
  }

  if (usedPercent !== null) {
    await prisma.quotaSnapshot.create({
      data: {
        orgId,
        toolName: "litellm",
        windowType: "monthly",
        usedPercent,
        source: "litellm_budget",
      },
    });
  }

  return NextResponse.json({ ok: true, usedPercent, spend, budget });
}
