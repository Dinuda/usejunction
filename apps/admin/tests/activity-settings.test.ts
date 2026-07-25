import assert from "node:assert/strict";
import { test } from "vitest";
import { prisma } from "@usejunction/db";
import { defaultActivitySettings } from "../lib/activity/contracts";
import { getOrgActivitySettings, upsertOrgActivitySettings } from "../lib/activity/service";

test("default activity settings allow device activity and tools browse", () => {
  assert.equal(defaultActivitySettings().teamDeviceActivityEnabled, true);
  assert.equal(defaultActivitySettings().teamToolsBrowseEnabled, true);
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
      teamDeviceActivityEnabled: true,
      teamToolsBrowseEnabled: true,
      updatedAt: null,
    });

    const saved = await upsertOrgActivitySettings(org.id, {
      teamDeviceActivityEnabled: false,
      teamToolsBrowseEnabled: false,
      updatedByUserId: null,
    });
    assert.equal(saved.teamDeviceActivityEnabled, false);
    assert.equal(saved.teamToolsBrowseEnabled, false);
    assert.ok(saved.updatedAt);

    const loaded = await getOrgActivitySettings(org.id);
    assert.equal(loaded.teamDeviceActivityEnabled, false);
    assert.equal(loaded.teamToolsBrowseEnabled, false);

    const patched = await upsertOrgActivitySettings(org.id, {});
    assert.equal(patched.teamDeviceActivityEnabled, false);
    assert.equal(patched.teamToolsBrowseEnabled, false);

    const toolsOnly = await upsertOrgActivitySettings(org.id, {
      teamToolsBrowseEnabled: true,
    });
    assert.equal(toolsOnly.teamDeviceActivityEnabled, false);
    assert.equal(toolsOnly.teamToolsBrowseEnabled, true);
  } finally {
    await prisma.organization.delete({ where: { id: org.id } });
  }
});
