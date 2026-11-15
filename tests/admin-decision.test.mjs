import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminDecision } from "../apps/web/lib/admin-decision.ts";

test("publication and relationship approvals require an explicit valid decision", () => {
  assert.equal(parseAdminDecision("approved"), "approved");
  assert.equal(parseAdminDecision("rejected"), "rejected");
  for (const value of ["", "approve", "rejected\0", "approved ", "true", "unknown"]) {
    assert.throws(() => parseAdminDecision(value), /explicit/);
  }
});
