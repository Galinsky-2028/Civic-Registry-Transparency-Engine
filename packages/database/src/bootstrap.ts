import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseRegistryConfig } from "@civic-registry/config";
import {
  createDatabasePool,
  PostgresRegistryConfigRepository,
  runMigrations,
  seedRegistry,
} from "./index.ts";

const pool = createDatabasePool();

try {
  const migrations = await runMigrations(pool);
  console.log(`Database ready: ${migrations.applied.length} migrations applied.`);

  // Explicit opt-in for the example deployment. Never reset an installed
  // registry on restart, so operator edits and audit history survive deploys.
  if (process.env.CIVIC_REGISTRY_SEED_GENERIC === "true") {
    const configs = new PostgresRegistryConfigRepository(pool);
    if (!(await configs.get("public-document-catalog"))) {
      const config = parseRegistryConfig(await readFile(
        fileURLToPath(new URL("../../../examples/generic-registry/registry.yaml", import.meta.url)),
        "utf8",
      ));
      const seed = JSON.parse(await readFile(
        fileURLToPath(new URL("../../../examples/generic-registry/seed.json", import.meta.url)),
        "utf8",
      ));
      await seedRegistry(pool, config, seed);
      console.log("Installed the generic example catalog (demonstration data).");
    }
  }
} finally {
  await pool.end();
}
