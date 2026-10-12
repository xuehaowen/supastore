# Fulfillment execution

Preparation, dispatch, shipment tracking, delivery and atomic slot rescheduling.

## When working here

Stock consumption must happen once per dispatched/handoff unit. Order completion and rewards wait for delivery of every ordered unit.

## Where to start

- [dispatch-order.ts](dispatch-order.ts): Dispatches eligible fulfillment and consumes reserved stock.
- [fulfillment-operations.ts](fulfillment-operations.ts): Prepares orders and records fulfillment progress.
- [reschedule-order.ts](reschedule-order.ts): Moves an order between eligible slots atomically.
- [shipments.ts](shipments.ts): Tracks quantities, dispatch and delivery across shipments.

## Related paths and checks

- Storage: `inventory.ts`, `shipping.ts`, `shipments.ts` and accepted order fulfillment snapshots.
- Checks: unit `shipments.test.ts` / `delivery.test.ts`, browser `fulfillment-options.spec.ts`; integration `reward-expansion.test.ts` covers completion/reward interaction.
- Merchant entry points: admin fulfillment/shipments, packing slips and `/api/v1/admin/fulfillment`. Carrier callbacks enter `/api/webhooks/carrier`; pickup handoff requires recipient verification.

## More context

[Parent overview](../README.md)
