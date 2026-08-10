import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { UndeliverableEmailRecipientError } from "@/lib/email/recipient";

const mocks = vi.hoisted(() => ({
  prisma: {
    dailyReportDelivery: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: { findMany: vi.fn() },
    organizationMembership: { findMany: vi.fn() },
  },
  getDailyReportPayload: vi.fn(),
  sendDailyReportEmail: vi.fn(),
  renderHtmlToPdf: vi.fn(),
  resendSend: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/reports/daily-report", () => ({
  getDailyReportPayload: mocks.getDailyReportPayload,
}));
vi.mock("@/lib/errors/public", () => ({
  logServerError: mocks.logServerError,
}));
vi.mock("@/lib/email/render-pdf", () => ({
  renderHtmlToPdf: mocks.renderHtmlToPdf,
}));
vi.mock("@/lib/email/daily-report-pdf", () => ({
  buildDailyReportPdfHtml: vi.fn(() => ({
    subject: "Your day.",
    filename: "report.pdf",
    html: "<html></html>",
    url: "https://app.usejunction.dev/dashboard",
  })),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.resendSend };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  mocks.prisma.dailyReportDelivery.findUnique.mockResolvedValue(null);
  mocks.prisma.dailyReportDelivery.upsert.mockResolvedValue({});
  mocks.renderHtmlToPdf.mockResolvedValue(Buffer.from("pdf"));
  mocks.resendSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

const minimalReport = {
  kind: "personal",
  period: "day",
  localDate: "2026-08-10",
  timeZone: "UTC",
  title: "Your day.",
  subtitle: "2026-08-10",
  kpis: {
    requests: 0,
    tokens: 0,
    cost: 0,
    tools: 0,
    requestsDeltaPct: null,
    tokensDeltaPct: null,
    costDeltaPct: null,
    planUsedPercent: null,
    acceptancePercent: null,
  },
  plan: {
    usedPercent: null,
    statusLabel: "No plan data",
    withinAllowance: true,
    hint: "",
    tools: [],
  },
  series: [],
  wowStrip: null,
  topTools: [],
  recentActivity: [],
} as never;

test("sendDailyReportEmail rejects reserved domains before Resend", async () => {
  const { sendDailyReportEmail } = await import("@/lib/email/daily-report");

  await assert.rejects(
    () => sendDailyReportEmail({ to: "owner@example.com", report: minimalReport }),
    (error: unknown) => error instanceof UndeliverableEmailRecipientError,
  );

  assert.equal(mocks.renderHtmlToPdf.mock.calls.length, 0);
  assert.equal(mocks.resendSend.mock.calls.length, 0);
  assert.equal(mocks.logServerError.mock.calls.length, 0);
});

test("sendDailyReportEmail maps Resend reserved-domain errors without alerting", async () => {
  mocks.resendSend.mockResolvedValue({
    data: null,
    error: {
      statusCode: 422,
      name: "validation_error",
      message:
        "Invalid `to` field. Please use our testing email address instead of domains like `example.com`. See our documentation for more information.",
    },
  });

  const { sendDailyReportEmail } = await import("@/lib/email/daily-report");

  await assert.rejects(
    () => sendDailyReportEmail({ to: "ada@acme.co", report: minimalReport }),
    (error: unknown) => error instanceof UndeliverableEmailRecipientError,
  );

  assert.equal(mocks.resendSend.mock.calls.length, 1);
  assert.equal(mocks.logServerError.mock.calls.length, 0);
});

test("runDailyReportSend skips example.com recipients without alerting", async () => {
  mocks.prisma.organizationMembership.findMany.mockResolvedValue([
    {
      orgId: "org-1",
      role: "owner",
      user: {
        id: "user-1",
        email: "owner@example.com",
        name: "Owner",
        timeZone: "UTC",
        notificationPreferences: [],
        developerProfiles: [{ id: "dev-1", orgId: "org-1" }],
      },
    },
  ]);

  const { runDailyReportSend } = await import("@/lib/reports/daily-report-send");
  const result = await runDailyReportSend(new Date("2026-08-10T19:30:00.000Z"), {
    ignoreHour: true,
  });

  assert.equal(result.due, 1);
  // ignoreHour makes both personal daily and team weekly due for owners
  assert.equal(result.skipped, 2);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
  assert.equal(mocks.getDailyReportPayload.mock.calls.length, 0);
  assert.equal(mocks.logServerError.mock.calls.length, 0);
  assert.equal(mocks.prisma.dailyReportDelivery.upsert.mock.calls.length, 0);
});
