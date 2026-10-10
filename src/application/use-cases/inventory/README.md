# Stock and slot operations

Counted variant stock, reservations, slot capacity, and per-slot variant limits.

## When working here

Lock competing writers consistently. Manual-payment deadlines require review and do not automatically free stock or capacity.

## Where to start

- [slot-operations.ts](slot-operations.ts): Reserves and releases fulfillment slot capacity.
- [stock-operations.ts](stock-operations.ts): Counts stock and manages variant reservations.

## Related paths and checks

- Storage: `inventory.ts`, `shipping.ts` and order reservation records.
- Checks: unit `configured-slot-capacity.test.ts` and `fulfillment-options.test.ts`; browser `fulfillment-options.spec.ts`.
- Merchant entry points: admin inventory, pending review and slots. Counted shortages block handoff; never erase committed reservations to make the count look available.

## More context

[Parent overview](../README.md)
