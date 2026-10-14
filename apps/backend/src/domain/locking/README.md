# Shared lock ordering

Sorted, deduplicated transactional lock acquisition for financial resources.

## When working here

The helper cannot police direct locks in callers. Review every competing writer and resolve historical contract differences before introducing a new sequence.

## Where to start

- [lock-order.ts](lock-order.ts): Declares lock targets, sorts resource IDs and acquires database locks. Inspect its callers' direct locks as well.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../../../docs/transaction-contracts.md)
