import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildPlatformConnectInviteCommands,
  buildPlatformInstallCommands,
  buildWindowsInstallCommand,
} from "../lib/connect-command";

test("platform install commands preserve Unix and add PowerShell onboarding", () => {
  const commands = buildPlatformInstallCommands("uj_enroll_token", "https://usejunction.dev/");
  assert.match(commands.macosLinux, /install\.sh/);
  assert.match(commands.macosLinux, /--token uj_enroll_token/);
  assert.match(commands.windows, /^powershell\.exe /);
  assert.match(commands.windows, /install\.ps1/);
  assert.match(commands.windows, /-Token 'uj_enroll_token'/);
  assert.match(commands.windows, /-Url 'https:\/\/usejunction\.dev'/);
});

test("PowerShell command literals escape single quotes", () => {
  const command = buildWindowsInstallCommand("token'value", "https://example.com/o'rg");
  assert.match(command, /token''value/);
  assert.match(command, /o''rg/);
});

test("connect invite commands use platform-specific token flags", () => {
  const commands = buildPlatformConnectInviteCommands("uj_connect_token", "https://usejunction.dev");
  assert.match(commands.macosLinux, /--connect uj_connect_token/);
  assert.match(commands.windows, /-Connect 'uj_connect_token'/);
});
