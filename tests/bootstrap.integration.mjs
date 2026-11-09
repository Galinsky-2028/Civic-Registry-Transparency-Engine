import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  createDatabasePool,
  PostgresRegistryConfigRepository,
  runMigrations,
} from "../packages/database/src/index.ts";

const exec = promisify(execFile);

test("deployment bootstrap installs examples only on first run and preserves edits", async () => {
  const pool = createDatabasePool();
  const bootstrap = (enabled) => exec(process.execPath, [
    "packages/database/src/bootstrap.ts",
  ], {
    env: { ...process.env, CIVIC_REGISTRY_SEED_GENERIC: String(enabled) },
    timeout: 30000,
  });

  try {
    await runMigrations(pool);
    await pool.query("TRUNCATE civic_registry_configurations CASCADE");
    const configs = new PostgresRegistryConfigRepository(pool);

    await bootstrap(false);
    assert.equal(await configs.get("public-document-catalog"), null);

    await bootstrap(true);
    const config = await configs.get("public-document-catalog");
    assert.ok(config);
    config.registry.name = "Operator-edited catalog";
    await configs.upsert(config);

    await bootstrap(true);
    assert.equal((await configs.get("public-document-catalog")).registry.name,
      "Operator-edited catalog");
  } finally {
    await pool.end();
  }
});
