# Render operations

The Blueprint runs the domain-neutral engine with the bundled fictional
Public Document Catalog. This is an example deployment, not a live government
data feed. No downstream application or certification is claimed.

## Deployment

The live demonstration runs in the campaign Render workspace as the free web
service `civic-registry-demo` (Ohio), at
`https://civic-registry-demo.onrender.com`. PostgreSQL is the dedicated Neon
project **Civic Registry** (AWS us-east-2) in the campaign Neon organization.
Its default compute is capped at 0.25 CU and scales to zero when idle. An
earlier `civic-registry-preview-v2` service and its Neon project belong to a
different account and are not managed from this repository.

To recreate or repair the service:

1. Create a Neon project in the campaign organization (or reuse **Civic
   Registry**) and copy its **direct** (non-pooler) connection string with
   `sslmode=verify-full`. The engine uses session advisory locks and session
   actor context, so do not use the PgBouncer pooler host.
2. Create a free Render web service from this repository with the settings in
   `render.yaml` (Node runtime, build and start commands, `/api/ready` health
   check, deploy after checks pass). Set `DATABASE_URL` as a secret on the
   service's Environment page; it is never committed. Let Render generate the
   session secret and the three role credentials.
3. Deploy, then confirm the deploy is `live`, the logs show migrations and
   example installation, and `/api/ready` passes. Browse the catalog, search
   records, and check `/api/v1/registries` and the public export.

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

Render generates `CIVIC_REGISTRY_ADMIN_SESSION_SECRET` and three distinct role
credentials: `CIVIC_REGISTRY_EDITOR_TOKEN`, `CIVIC_REGISTRY_REVIEWER_TOKEN`, and
`CIVIC_REGISTRY_PUBLISHER_TOKEN`. `scripts/render-start.sh` converts the role
credentials into server-side principal digests before Next.js starts. Retrieve
a role credential privately from the service's Render Environment page and use
it at `/admin/sign-in`; the form cannot choose an identity or roles. Rotating a
credential or the session secret revokes existing sessions. For named
operators, set `CIVIC_REGISTRY_ADMIN_PRINCIPALS` as described in
[Administrator console](ADMIN-CONSOLE.md). `CIVIC_REGISTRY_ADMIN_TOKEN` is
retired and ignored.

## Free plan limits

The free Render web service sleeps when idle, so the first request after a
quiet period is slow, and its filesystem is ephemeral. The Neon project uses
the campaign organization's free plan; check its storage and compute-hour
allowances and its point-in-time restore window before relying on it, and
arrange tested logical backups for anything beyond fictional example data. The
example requires no stored attachment files. Before enabling fetched PDF
storage, attach a persistent disk on a compatible paid service and set
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
