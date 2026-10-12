# Business commands and queries

The main entry point for order, catalog, customer, inventory, payment, credit, and merchant workflows.

## When working here

Root files contain cross-module order operations; subdirectories organize focused areas. Trace both direct locks and helpers before changing a financial command.

## Where to start

- [create-order.ts](create-order.ts): Placement, snapshots and atomic purchase reservations.
- [get-quote.ts](get-quote.ts): Authoritative quote and fulfillment pricing.
- [confirm-order.ts](confirm-order.ts): Payment coverage and confirmation prerequisites.
- [refund-payout.ts](refund-payout.ts): Refund authorization and payout reconciliation.

- [Cart workflows](cart/README.md): Read and mutate an owned cart before checkout.
- [Catalog management](catalog/README.md): Product and variant editing, options, specifications, collections, translations, media, imports and exports.
- [Customer accounts](customers/README.md): Profile/address ownership and optional SMS preferences/verification.
- [Fulfillment execution](fulfillment/README.md): Preparation, dispatch, shipment tracking, delivery and atomic slot rescheduling.
- [Guest access and recovery](guest/README.md): Guest session creation and private tracking-link request/verification.
- [Stock and slot operations](inventory/README.md): Counted variant stock, reservations, slot capacity, and per-slot variant limits.
- [Cancellation and excess funds](orders/README.md): Order cancellation and surplus/late-payment return operations.
- [Incoming and provider payments](payments/README.md): Cash receipts, corrections, Stripe checkout/refund reconciliation, expiry and drawer reports.
- [Promotion management](promotions/README.md): Merchant discount/promotion configuration used by authoritative checkout pricing.
- [Sales reporting](reports/README.md): Fiscal sales totals, outside-sales adjustments, and threshold checks.
- [Physical goods returns](returns/README.md): Customer return requests and merchant approval/receipt workflows.
- [Staff governance](staff/README.md): Staff membership changes and trusted owner recovery.
- [Store policies and setup](store/README.md): Settings, ordering pause, email verification/readiness, destinations, delivery and slot capacity.
- [Credit and rewards](store-credit/README.md): Source lots, credit holds/capture/refunds, reward release/reversal and funding-review repair.
- [Private evidence uploads](uploads/README.md): Expiring upload intents, immutable candidate finalization and abandoned-upload cleanup.

## Related paths and checks

- Storage: `carts.ts`, `quotes.ts`, `orders.ts`, `order-proposals.ts`, `payments.ts`, `refunds-payouts.ts` and `operations.ts` in the schema directory.
- Checks: unit `checkout.test.ts`, `confirmation-cancellation.test.ts`, `financial-projection.test.ts`, `payout-discrepancies.test.ts`; integration `lightweight-commerce.test.ts` and `payout-order-lock.test.ts`.
- Order lifecycle is unpaid → confirmed → completed, or eligible cancellation; payment/refund/hold state is separate. `record-receipt.ts` records incoming funds; `order-proposals.ts` handles restricted pre-receipt changes; `refund-payout.ts` coordinates entitlements and payout attempts. Never infer settlement from lifecycle alone. Payout claims bind a verified original destination; unknown outcomes and late evidence block replacement transfers.

## More context

[Parent overview](../README.md)
