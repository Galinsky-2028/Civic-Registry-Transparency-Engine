import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapPrincipals } from "../scripts/admin-principals.mjs";
import { parseAdminPrincipals, authenticateAdminPrincipal } from "../apps/web/lib/admin-session.ts";

test("deployment credentials bind separate editor and reviewer roles without exposing signing secrets", () => {
  const env = { CIVIC_REGISTRY_EDITOR_TOKEN: "editor-".repeat(8), CIVIC_REGISTRY_REVIEWER_TOKEN: "reviewer-".repeat(8), CIVIC_REGISTRY_PUBLISHER_TOKEN: "publisher-".repeat(8) };
  const principals = parseAdminPrincipals(bootstrapPrincipals(env));
  assert.deepEqual(authenticateAdminPrincipal(env.CIVIC_REGISTRY_EDITOR_TOKEN, principals).roles, ["editor"]);
  assert.deepEqual(authenticateAdminPrincipal(env.CIVIC_REGISTRY_REVIEWER_TOKEN, principals).roles, ["reviewer"]);
  assert.deepEqual(authenticateAdminPrincipal(env.CIVIC_REGISTRY_PUBLISHER_TOKEN, principals).roles, ["publisher"]);
  assert.equal(authenticateAdminPrincipal("unknown-".repeat(8), principals), null);
  assert.doesNotMatch(bootstrapPrincipals(env), /editor-editor-|reviewer-reviewer-/);
  assert.throws(() => bootstrapPrincipals({ ...env, CIVIC_REGISTRY_REVIEWER_TOKEN: env.CIVIC_REGISTRY_EDITOR_TOKEN }));
  assert.throws(() => bootstrapPrincipals({ CIVIC_REGISTRY_EDITOR_TOKEN: "short" }));
  assert.equal(bootstrapPrincipals({}), "[]");
  assert.equal(bootstrapPrincipals({ CIVIC_REGISTRY_ADMIN_PRINCIPALS: "[]" }), "[]");
});
