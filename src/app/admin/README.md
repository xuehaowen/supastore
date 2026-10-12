# Merchant administration

Authenticated merchant screens and actions for setup, catalog, orders, payments, inventory, fulfillment, returns, reports, and notifications.

## When working here

Navigation is not authorization. Backend use cases must verify active staff membership and owner privileges for sensitive operations.

## Where to start

- [catalog-actions.ts](catalog-actions.ts): Merchant catalog action entry points.
- [operations.tsx](operations.tsx): Merchant views backed by the authorized [operations read model](../../application/queries/admin-operations.ts).
- [overview-view.tsx](overview-view.tsx), [orders-view.tsx](orders-view.tsx), and [payments-view.tsx](payments-view.tsx): Screen-specific markup and forms; the operations entry point coordinates identity, filters, and data.
- [fulfillment-operations.tsx](fulfillment-operations.tsx): Paginated fulfillment and selected payment/order operations. Older orders can be opened directly regardless of the current page.
- [payout-queue.tsx](payout-queue.tsx): Payout and discrepancy forms with independent pagination.

## More context

[Parent overview](../README.md)
