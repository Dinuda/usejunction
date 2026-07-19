// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { WorkspaceSettingsCard } from "@/components/settings/workspace-settings-card";
import "../setup/component";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

test("workspace form uses named native colors and announces a successful save", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      organization: { name: "Junction Labs", color: "#2563eb" },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <WorkspaceSettingsCard
      orgId="org-1"
      initialName="Junction"
      initialColor="#0f766e"
    />,
  );

  expect(screen.getByRole("region", { name: "Workspace" })).toBeTruthy();
  const radios = screen.getAllByRole("radio");
  expect(radios).toHaveLength(8);
  expect(screen.getByRole("radio", { name: "Teal" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Blue" })).not.toBeChecked();

  fireEvent.change(screen.getByLabelText("Workspace name"), {
    target: { value: "Junction Labs" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
  expect(screen.getByRole("radio", { name: "Blue" })).toBeChecked();

  const form = screen.getByRole("button", { name: "Save workspace" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved."));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/organizations/current",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "Junction Labs", color: "#2563eb" }),
    }),
  );
  expect(router.refresh).toHaveBeenCalled();
});
