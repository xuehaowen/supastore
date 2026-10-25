# Physical goods returns

Customer return requests and merchant approval/receipt workflows.

## When working here

Enforce order access and quantity limits. Receiving goods or requesting a return does not itself approve or settle a refund.

## Where to start

- [manage-returns.ts](manage-returns.ts): Authorizes requests and records physical-goods return progress.

## Related paths and checks

- Storage: `returns.ts` for goods requests/quantities; refund/payout and original funding records govern money separately.
- Checks: unit `customer-return-api.test.ts` and integration `lightweight-commerce.test.ts`; cross-service browser journeys cover goods receipt and refund settlement.
- Customer endpoint: `/api/v1/orders/[id]/returns`; merchant screens: admin returns and order detail. Refund authorization/settlement is coordinated by parent `refund-payout.ts` and store-credit purchase refund operations.

## More context

[Parent overview](../README.md)
