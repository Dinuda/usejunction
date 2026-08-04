import test from "node:test";
import assert from "node:assert/strict";
import { classifyTask, normalizeModel, projectLabel, resetProjectLabels } from "../src/normalize/normalize.js";

test("classifies task text without retaining the text", () => {
  assert.equal(classifyTask("Please refactor this module and simplify the API"), "refactor");
  assert.equal(classifyTask("Fix the regression in the login flow"), "bug fix");
  assert.equal(classifyTask("Add support for export filters"), "feature");
  assert.equal(classifyTask(""), "unknown");
});

test("normalizes model labels and hashes project labels", () => {
  assert.equal(normalizeModel("openai/gpt-test"), "gpt-test");
  resetProjectLabels();
  const first = projectLabel("/private/project-a");
  assert.equal(first, projectLabel("/private/project-a"));
  assert.notEqual(first, projectLabel("/private/project-b"));
  assert.match(first, /^project-[a-f0-9]{8}$/);
});
