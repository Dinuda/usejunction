import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDailyReportSend: vi.fn(),
}));

vi.mock("@/lib/reports/daily-report-send", () => ({
  runDailyReportSend: mocks.runDailyReportSend,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mocks.runDailyReportSend.mockResolvedValue({
    scanned: 3,
    due: 1,
    sent: 2,
    skipped: 0,
    failed: 0,
  });
});

test("daily report cron sends for due users", async () => {
  const { POST } = await import("@/app/api/cron/daily-report-send/route");
  const response = await POST(
    new Request("http://localhost/api/cron/daily-report-send", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    }) as never,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.sent, 2);
  assert.equal(mocks.runDailyReportSend.mock.calls.length, 1);
});

test("daily report cron force bypasses timezone gate in production", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const { POST } = await import("@/app/api/cron/daily-report-send/route");
    const response = await POST(
      new Request("http://localhost/api/cron/daily-report-send?force=1&resend=1", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      }) as never,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manualTrigger?.ignoreHour, true);
    assert.equal(body.manualTrigger?.resend, true);
    assert.equal(mocks.runDailyReportSend.mock.calls.length, 1);
    assert.deepEqual(mocks.runDailyReportSend.mock.calls[0][1], {
      ignoreHour: true,
      resend: true,
      utcHour: undefined,
    });
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("daily report cron rejects invalid secret", async () => {
  const { POST } = await import("@/app/api/cron/daily-report-send/route");
  const response = await POST(
    new Request("http://localhost/api/cron/daily-report-send", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    }) as never,
  );
  assert.equal(response.status, 401);
  assert.equal(mocks.runDailyReportSend.mock.calls.length, 0);
});
