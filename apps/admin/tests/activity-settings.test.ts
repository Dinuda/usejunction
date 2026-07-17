import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import { defaultActivitySettings } from "../lib/activity/contracts";
import { getOrgActivitySettings, upsertOrgActivitySettings } from "../lib/activity/service";

test("default activity settings are off for team features", () => {
  assert.equal(defaultActivitySettings().teamPeriodControlsEnabled, false);
  assert.equal(defaultActivitySettings().teamDeviceActivityEnabled, false);
  assert.equal(defaultActivitySettings().updatedAt, null);
});

test("activity settings upsert and read round-trip", {
  skip: process.env.RUN_ACTIVITY_SETTINGS_DB_TESTS !== "1" && !process.env.DATABASE_URL,
}, async () => {
  const suffix = Date.now().toString(36);
  const org = await prisma.organization.create({
    data: { name: `Activity settings ${suffix}`, slug: `activity-settings-${suffix}` },
  });

  try {
    const missing = await getOrgActivitySettings(org.id);
    assert.deepEqual(missing, {
      teamPeriodControlsEnabled: false,
      teamDeviceActivityEnabled: false,
      updatedAt: null,
    });

    const saved = await upsertOrgActivitySettings(org.id, {
      teamPeriodControlsEnabled: true,
      teamDeviceActivityEnabled: true,
      updatedByUserId: null,
    });
    assert.equal(saved.teamPeriodControlsEnabled, true);
    assert.equal(saved.teamDeviceActivityEnabled, true);
    assert.ok(saved.updatedAt);

    const loaded = await getOrgActivitySettings(org.id);
    assert.equal(loaded.teamPeriodControlsEnabled, true);
    assert.equal(loaded.teamDeviceActivityEnabled, true);

    const patched = await upsertOrgActivitySettings(org.id, {
      teamPeriodControlsEnabled: false,
    });
    assert.equal(patched.teamPeriodControlsEnabled, false);
    assert.equal(patched.teamDeviceActivityEnabled, true);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
