// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { test, expect } from "vitest";
import { PlatformCommand } from "../../components/onboarding/platform-command";

test("platform command switches between terminal and Windows PowerShell", () => {
  render(<PlatformCommand commands={{ macosLinux: "unix-install", windows: "windows-install" }} />);

  expect(screen.getByText("unix-install")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Windows" }));
  expect(screen.getByText("windows-install")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy Windows PowerShell command" })).toBeTruthy();
});
