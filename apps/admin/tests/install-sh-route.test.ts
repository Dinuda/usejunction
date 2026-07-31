import { expect, test } from "vitest";
import { GET } from "../app/install.sh/route";

test("localhost install.sh injects USEJUNCTION_ROOT for local builds", async () => {
  const response = await GET(new Request("http://localhost:3001/install.sh"));
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/^# Injected by local control plane/m);
  expect(body).toMatch(/^export USEJUNCTION_ROOT='/m);
  expect(body).toMatch(/^export USEJUNCTION_PROFILE=test/m);
  expect(body).toMatch(/agent\/main\.go|# Prefer the checkout pinned/s);
});

test("non-loopback install.sh stays customer-facing without injection", async () => {
  const response = await GET(new Request("https://app.usejunction.com/install.sh"));
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).not.toMatch(/^# Injected by local control plane/m);
  expect(body).not.toMatch(/^export USEJUNCTION_ROOT=/m);
  expect(body).not.toMatch(/^export USEJUNCTION_PROFILE=/m);
  expect(body).toMatch(/^#!/);
});
