import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("attachment ingestion command requires a record, host allowlist and URLs before connecting", () => {
  const result = spawnSync(
    process.execPath,
    ["packages/database/src/cli.ts", "ingest-attachments", "registry-only"],
    { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage: ingest-attachments <registry-id> <record-id> <allowed-host/);
});
