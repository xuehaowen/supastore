# Database schema definitions

Drizzle table definitions grouped by storage ownership.

## When working here

Review foreign keys, uniqueness and checks alongside use-case locks. Definitions alone do not update a deployed database; add a forward migration.

## Where to start

- [index.ts](index.ts): Schema exports and storage inventory.
- [orders.ts](orders.ts): Accepted purchase and lifecycle records.
- [payments.ts](payments.ts): Incoming funds and receipt/correction storage.
- [outbox.ts](outbox.ts): Durable outbound coordination records.

## More context

[Parent overview](../README.md) · [Data model](../../../../../../docs/database-schema.md)
