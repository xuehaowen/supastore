# Fast unit and domain checks

Pure calculations, request boundaries, policy and synthetic lifecycle tests.

## When working here

Run pnpm test. Domain-only coverage uses pnpm test:coverage; database concurrency belongs in integration tests.

## Where to start

- [money-calculations.test.ts](money-calculations.test.ts): Price/refund arithmetic.
- [financial-projection.test.ts](financial-projection.test.ts): Funding and balance invariants.
- [synthetic-order-lifecycle.test.ts](synthetic-order-lifecycle.test.ts): Domain lifecycle simulation, separate from database/browser evidence.

For other changes, find the test named after the workflow or helper being changed.

## More context

[Parent overview](../README.md)
