# Shared workflow helpers

Validation, errors, guest access, request identity, rate limits, transaction types, and event emission.

## When working here

Helpers support command-specific authorization and locking; they do not automatically make every caller safe or idempotent.

## Where to start

- [errors.ts](errors.ts): Shared domain and authorization errors.
- [events.ts](events.ts): Persists business notification events with state changes.
- [guest-access.ts](guest-access.ts): Checks scoped private order access.
- [idempotency.ts](idempotency.ts): Persists actor/command request fingerprints and results.
- [rate-limit.ts](rate-limit.ts): Process-local fixed-window request limiting backed by an LRU cache.
- [request-validation.ts](request-validation.ts): Shared command input parsing and validation.
- [transaction.ts](transaction.ts): Shared Drizzle transaction type.

## More context

[Parent overview](../README.md)
