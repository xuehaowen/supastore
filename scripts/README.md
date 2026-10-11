# Development and operator tools

Test fixtures, builds/migrations, seeds, benchmarks, release checks and backup/recovery tooling.

## When working here

Inspect target database, Compose project and outbound suppression before mutation. Synthetic runners are not production provider acceptance.

## Where to start

- [backend.mjs](backend.mjs): Backend launcher using root Next.js source.
- [test-integration.mjs](test-integration.mjs): Isolated PostgreSQL integration runner.
- [test-browser.mjs](test-browser.mjs): Main production browser fixture runner.
- [test-storefront.mjs](test-storefront.mjs): Two-service browser runner.
- [check-release-services.mjs](check-release-services.mjs): Provider configuration/connectivity probe.
- [migrate.mjs](migrate.mjs): Migrations use `MIGRATION_DATABASE_URL` (or the explicitly supplied migration `DATABASE_URL`). When application role credentials are supplied, grants are refreshed after every migration. The role can read/write public application tables and sequences, but cannot create schemas, alter tables, or access migration history. Existing roles owning database objects are rejected; use a new application role and switch the backend connection. The application role is a trusted backend identity; customer authorization remains in the application. Store administrator credentials only in the migration environment. Passwords embedded in connection URLs must be URL-encoded.

## More context

[Parent overview](../README.md)
