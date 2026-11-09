# Render operations

The Blueprint runs the domain-neutral engine with the bundled fictional
Public Document Catalog. This is an example deployment, not a live government
data feed. No downstream application or certification is claimed.

## Deployment

1. Push `render.yaml` and the lockfile to `main`.
2. Create a Blueprint from this repository. To repair the existing
   `civic-registry-preview-v2` service, review an **adopt** plan and verify that
   it updates only that service. The Render workspace is at its resource cap;
   the existing Neon Civic Registry project provides PostgreSQL.
3. Set `DATABASE_URL` on the existing Render service from the Civic Registry
   Neon project's `render-live` branch. Use a direct TLS connection because this
   engine uses session advisory locks and session actor context. This secret is
   managed on Render's Environment page, separately from Blueprint-owned keys;
   Blueprint syncs preserve it. No secrets belong in Git.
4. Apply the reviewed plan. Render generates the administrator token.
5. Monitor the deploy until live, then check `/api/ready`, browse the catalog,
   search records, and check `/api/v1/registries` and the public export.

Startup applies checksum-verified, advisory-locked migrations before Next.js
accepts traffic. `CIVIC_REGISTRY_SEED_GENERIC=true` installs the example only
when its configuration does not already exist; subsequent restarts preserve
operator changes. Never run the unconditional `db:seed-generic` command against
an edited catalog. If first-run seeding is interrupted, inspect the database
and complete the seed before allowing operator edits.

`/api/health` checks process liveness. `/api/ready` checks database access and
the final migration, returns 503 on failure, and omits internal error details.
The HTTP query timeout and database connection timeout are three seconds.

## Operator access

Retrieve `CIVIC_REGISTRY_ADMIN_TOKEN` on the service's Render Environment page
and use it at `/admin/sign-in`. Keep it secret and rotate it there if exposed;
rotation invalidates existing signed sessions. This console uses a shared
operator token. Identity-verified roles require downstream SSO/RBAC integration.

## Free plan limits

The Blueprint keeps the existing free Render web service, which sleeps when
idle and uses an ephemeral filesystem. The database reuses the existing Neon
project on its current account plan; normal Neon usage billing applies. The
`render-live` compute is capped at 0.25 CU and suspends after five idle minutes.
It does not have Render Free Postgres's 30-day expiry. Arrange tested backups
and monitor database usage. The example requires no stored attachment files. Before enabling fetched PDF storage, attach a
persistent disk on a compatible paid service and set
`CIVIC_REGISTRY_DOCUMENT_STORAGE_DIR` to its mount, or implement durable object
storage. Database metadata alone does not preserve files after a restart.

Email delivery requires an email relay and sender configuration. Source-refresh,
scheduled publication, deadline reconciliation, and notification processing
need an operator or a separately configured scheduler; deployment does not
automatically enable external feeds or outgoing mail.

## Validation and recovery

Use `pnpm install --frozen-lockfile`, `pnpm run ci`,
`pnpm audit --prod`, `node scripts/validate-pr-registry.mjs`, and
`python3 scripts/validate_e2eesa_status.py`. Integration tests require a
dedicated PostgreSQL database and must never target production.

Failed migrations stop startup. Fix forward with a new migration; never edit
an applied migration. An application rollback does not undo database changes.
Before any data migration, export a backup and rehearse restoring it into a
separate database. The Neon connection requires TLS; keep its credentials in
Render secret environment variables and out of browsers, logs, and Git.
