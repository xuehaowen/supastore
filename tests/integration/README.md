# Transactional integration checks

Isolated PostgreSQL migrations, commerce, providers, rewards, reports and delivery coordination.

## When working here

Run pnpm test:integration. Use synthetic data and verify clean/upgrade behavior and races; provider fakes do not establish live acceptance.

## Where to start

- [lightweight-commerce.test.ts](lightweight-commerce.test.ts): Transactional commerce workflows.
- [stripe-lifecycle.test.ts](stripe-lifecycle.test.ts): Provider intent and settlement behavior with synthetic provider fixtures.
- [outbox-coordination.test.ts](outbox-coordination.test.ts): Durable notification coordination.
- [migration-rehearsal.test.ts](migration-rehearsal.test.ts): Migration upgrade checks.

## More context

[Parent overview](../README.md)
