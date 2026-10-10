# Versioned database changes

SQL migrations and Drizzle metadata/journal.

## When working here

Never edit an already applied migration to change production history. Verify clean installation and forward upgrade; metadata is generated schema history, not a business module.

## Where to start

- [Migration journal](meta/_journal.json): Ordered migration tags used by the migration tooling.
- [Migration runner](../../../../scripts/migrate.mjs): Applies the journaled migrations.
- [Upgrade rehearsal](../../../../scripts/rehearse-migrations.ts): Checks migration continuity on a test database.

SQL files in this directory describe each schema change. Use the journal to identify the migration relevant to the deployed version.

## More context

[Parent overview](../README.md) · [Data model](../../../../docs/database-schema.md)
