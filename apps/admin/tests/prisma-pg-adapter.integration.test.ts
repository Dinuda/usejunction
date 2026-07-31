import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, test } from "vitest";
import { prisma } from "@usejunction/db";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const verifySignalsIndex = process.env.PRISMA_VERIFY_SIGNALS_INDEX === "1";

afterAll(async () => {
  if (hasDatabase) await prisma.$disconnect();
});

test.skipIf(!hasDatabase)(
  "Rust-free PostgreSQL adapter handles writes, transactions, raw SQL, BigInt, Date, and JSON",
  async () => {
    const suffix = randomUUID();
    const organizationId = `adapter-${suffix}`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: organizationId,
            slug: `adapter-${suffix}`,
            name: "Adapter integration test",
          },
        });
        const updated = await tx.organization.update({
          where: { id: organizationId },
          data: { color: "#123456" },
        });
        assert.equal(updated.color, "#123456");
      });

      const rows = await prisma.$queryRaw<
        Array<{ integer_value: bigint; date_value: Date; json_value: { ok: boolean } }>
      >`
        SELECT
          9223372036854775806::bigint AS integer_value,
          TIMESTAMPTZ '2026-07-26T00:00:00.000Z' AS date_value,
          '{"ok":true}'::jsonb AS json_value
      `;

      assert.equal(rows[0]?.integer_value, 9223372036854775806n);
      assert.equal(rows[0]?.date_value.toISOString(), "2026-07-26T00:00:00.000Z");
      assert.deepEqual(rows[0]?.json_value, { ok: true });
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
  },
);

test.skipIf(!hasDatabase || !verifySignalsIndex)(
  "unfiltered organization Signals windows use the org/observed-at index",
  async () => {
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      return tx.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
        EXPLAIN (ANALYZE, FORMAT JSON)
        SELECT id
        FROM local_work_sessions
        WHERE org_id = ${`explain-${randomUUID()}`}
          AND observed_at >= ${new Date("2026-07-01T00:00:00.000Z")}
          AND observed_at < ${new Date("2026-08-01T00:00:00.000Z")}
        ORDER BY observed_at DESC
      `;
    });

    assert.match(
      JSON.stringify(plan),
      /local_work_sessions_org_id_observed_at_idx/,
    );
  },
);
