# Development and operator tools

Test fixtures, builds/migrations, seeds, benchmarks, release checks and backup/recovery tooling.

Use the [complete command reference](../docs/commands.md) for arguments, effects
and prerequisites, and the [operator cookbook](../docs/operator-cookbook.md) for
copyable setup, deployment and recovery recipes.

## When working here

Inspect target database, Compose project and outbound suppression before mutation. Synthetic runners are not production provider acceptance.

## Where to start

- [init-db.mjs](init-db.mjs): Run `pnpm db:init` and enter a dedicated local demo database name, or run `pnpm db:init supastore_dev`. Uses `MIGRATION_DATABASE_URL` (falling back to `DATABASE_URL`) from `.env` to connect to the existing PostgreSQL server, creates the database if needed, applies migrations, and seeds the demo store. Existing databases are preserved. Requires administrator credentials with database-creation privileges. Seed runs with outbound providers and the worker disabled. The entered database name is used only for this command; `.env` is never modified. To run the app against that database, set its name in `DATABASE_URL` yourself. New demo owner: `owner@example.test` / `AdminSetupSecret123!`; set `DEMO_OWNER_PASSWORD` before running to override the password. Existing owners keep their current password. Stop the app before initializing and restart it afterward. No Docker volumes or storage buckets are changed.
- [backend.mjs](backend.mjs): Backend launcher for `apps/backend`.
- [storefront.mjs](storefront.mjs): Storefront development, build and production launcher; validates in-memory settings and passes only runtime/public settings to its child. Root package commands preload environment files using Node options.
- [dev.mjs](dev.mjs): Starts both services for `pnpm dev` or `pnpm start`, and stops the sibling when one exits.
- [test-container-acceptance.mjs](test-container-acceptance.mjs): Builds and verifies the Linux images using isolated fixture Compose settings, with failure logs and fixture cleanup.
- [test-integration.mjs](test-integration.mjs): Isolated PostgreSQL integration runner.
- [test-browser.mjs](test-browser.mjs): Main production browser fixture runner.
- [test-storefront.mjs](test-storefront.mjs): Two-service browser runner.
- [check-release-services.mjs](check-release-services.mjs): Provider configuration/connectivity probe.
- [migrate.mjs](migrate.mjs): Migrations use `MIGRATION_DATABASE_URL` (or the explicitly supplied migration `DATABASE_URL`). When application role credentials are supplied, grants are refreshed after every migration. The role can read/write public application tables and sequences, but cannot create schemas, alter tables, or access migration history. Existing roles owning database objects are rejected; use a new application role and switch the backend connection. The application role is a trusted backend identity; customer authorization remains in the application. Store administrator credentials only in the migration environment. Passwords embedded in connection URLs must be URL-encoded.

## More context

[Parent overview](../README.md)
