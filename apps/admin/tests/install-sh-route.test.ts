import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/install.sh/route";

test("localhost install.sh injects USEJUNCTION_ROOT for local builds", async () => {
  const response = await GET(new Request("http://localhost:3001/install.sh"));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /^# Injected by local control plane/m);
  assert.match(body, /^export USEJUNCTION_ROOT='/m);
  assert.match(body, /agent\/main\.go|# Prefer the checkout pinned/s);
});

test("non-loopback install.sh stays customer-facing without injection", async () => {
  const response = await GET(new Request("https://app.usejunction.com/install.sh"));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.doesNotMatch(body, /^# Injected by local control plane/m);
  assert.doesNotMatch(body, /^export USEJUNCTION_ROOT=/m);
  assert.match(body, /^#!/);
});
