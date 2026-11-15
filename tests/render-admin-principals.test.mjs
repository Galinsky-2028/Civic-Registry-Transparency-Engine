import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Render startup derives server-bound principals before the web server starts", async () => {
  const start = await readFile("scripts/render-start.sh", "utf8");
  const principals = start.indexOf("node scripts/admin-principals.mjs");
  const server = start.indexOf("exec node node_modules/next/dist/bin/next start");
  assert.ok(principals >= 0, "principal derivation is required");
  assert.ok(server > principals, "principals must be exported before Next.js starts");
  assert.match(start, /export CIVIC_REGISTRY_ADMIN_PRINCIPALS/);
});

test("Render Blueprint generates separate session and role secrets, not a shared token", async () => {
  const blueprint = await readFile("render.yaml", "utf8");
  for (const key of [
    "CIVIC_REGISTRY_ADMIN_SESSION_SECRET",
    "CIVIC_REGISTRY_EDITOR_TOKEN",
    "CIVIC_REGISTRY_REVIEWER_TOKEN",
    "CIVIC_REGISTRY_PUBLISHER_TOKEN",
  ]) {
    assert.match(blueprint, new RegExp(`- key: ${key}\\n\\s+generateValue: true`));
  }
  assert.doesNotMatch(blueprint, /CIVIC_REGISTRY_ADMIN_TOKEN/);
});
