import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  buildPlatformInstallCommands,
  buildPlatformResumeCommands,
  buildWindowsInstallCommand,
} from "../lib/connect-command";

const adminRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("platform install commands preserve Unix and add PowerShell onboarding", () => {
  const commands = buildPlatformInstallCommands("uj_enroll_token", "https://usejunction.dev/");
  assert.match(commands.macosLinux, /install\.sh/);
  assert.match(commands.macosLinux, /--token uj_enroll_token/);
  assert.match(commands.windows, /^powershell\.exe /);
  assert.match(commands.windows, /install\.ps1/);
  assert.match(commands.windows, /-Token 'uj_enroll_token'/);
  assert.match(commands.windows, /-Url 'https:\/\/usejunction\.dev'/);
});

test("platform resume commands retry setup without an enrollment token", () => {
  const commands = buildPlatformResumeCommands("https://usejunction.dev/");
  assert.match(commands.macosLinux, /install\.sh/);
  assert.match(commands.macosLinux, /--resume/);
  assert.doesNotMatch(commands.macosLinux, /--token/);
  assert.match(commands.windows, /install\.ps1/);
  assert.match(commands.windows, /-Resume/);
  assert.doesNotMatch(commands.windows, /-Token/);
});

test("repair install commands include a one-time enrollment token", () => {
  const commands = buildPlatformInstallCommands("uj_enroll_repair_token", "https://usejunction.dev/");
  assert.match(commands.macosLinux, /--token uj_enroll_repair_token/);
  assert.doesNotMatch(commands.macosLinux, /--resume/);
  assert.match(commands.windows, /uj_enroll_repair_token/);
});

test("PowerShell command literals escape single quotes", () => {
  const command = buildWindowsInstallCommand("token'value", "https://example.com/o'rg");
  assert.match(command, /token''value/);
  assert.match(command, /o''rg/);
});

test("connect-invite routes and team API are removed", () => {
  assert.equal(existsSync(path.join(adminRoot, "app/api/connect-invite")), false);
  assert.equal(existsSync(path.join(adminRoot, "app/connect-invite")), false);
  assert.equal(existsSync(path.join(adminRoot, "app/api/team/connect-invite")), false);
});
