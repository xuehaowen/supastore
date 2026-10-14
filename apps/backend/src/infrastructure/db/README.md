# Database access

PostgreSQL/Drizzle connection setup, schema, ledger cursors and versioned migrations.

## When working here

Use session-compatible connections for transaction locks. Run migrations separately from app startup and preserve financial history.

## Where to start

- [index.ts](index.ts): PostgreSQL connection and Drizzle setup.

- [ledger-cursor.ts](ledger-cursor.ts): Encodes and validates credit-ledger pagination cursors.
- [Database schema definitions](schema/README.md): Drizzle table definitions grouped by storage ownership.
- [Versioned database changes](migrations/README.md): SQL migrations and Drizzle metadata/journal.

## More context

Schema file names describe storage ownership; deployed state comes from the applied migration journal. Check clean installation and forward upgrade with `tests/integration/migration-rehearsal.test.ts`; credit-ledger cursor behavior is covered by `tests/unit/ledger-cursor.test.ts`. Runtime connections must retain the same session through a financial transaction.

[Parent overview](../README.md)
