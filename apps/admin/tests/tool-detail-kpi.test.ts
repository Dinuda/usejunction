import assert from "node:assert/strict";
import { test } from "vitest";
import { isPersonCovered, peopleKpiSubline } from "@/lib/queries/dashboard/tool-detail-kpi";

test("isPersonCovered: assignment counts as covered", () => {
  assert.equal(
    isPersonCovered({
      assignment: {
        id: "a1",
        planTemplateId: "t1",
        planName: "Team Standard",
        catalogPlanKey: "team-standard",
        source: "detected",
      },
      vendorPlan: null,
      hasUsage: false,
    }),
    true,
  );
});

test("isPersonCovered: vendor plan without assignment counts as covered", () => {
  assert.equal(
    isPersonCovered({
      assignment: null,
      vendorPlan: "team_standard",
      hasUsage: false,
    }),
    true,
  );
});

test("isPersonCovered: usage in period counts as covered", () => {
  assert.equal(
    isPersonCovered({
      assignment: null,
      vendorPlan: null,
      hasUsage: true,
    }),
    true,
  );
});

test("isPersonCovered: install only is not covered", () => {
  assert.equal(
    isPersonCovered({
      assignment: null,
      vendorPlan: null,
      hasUsage: false,
    }),
    false,
  );
});

test("KPI simulation: 3 installs, 2 covered, 1 install only", () => {
  const people = [
    { coverage: "covered" as const },
    { coverage: "covered" as const },
    { coverage: "install_only" as const },
  ];
  const peopleCovered = people.filter((p) => p.coverage === "covered").length;
  const peopleInstallOnly = people.filter((p) => p.coverage === "install_only").length;
  assert.equal(peopleCovered, 2);
  assert.equal(peopleInstallOnly, 1);
  assert.equal(peopleKpiSubline(peopleCovered, peopleInstallOnly), "2 with plans · 1 install only");
});
