# Incoming and provider payments

Cash receipts, corrections, Stripe checkout/refund reconciliation, expiry and drawer reports.

## When working here

Provider redirects do not prove settlement. Preserve durable intent on uncertain outcomes, and never rewrite settled receipt history.

## Where to start

- [cash-drawer-report.ts](cash-drawer-report.ts): Summarizes collected cash for reconciliation.
- [correct-receipt.ts](correct-receipt.ts): Audited corrections while preserving original receipt history.
- [expire-provider-order.ts](expire-provider-order.ts): Releases eligible unpaid holds after terminal provider expiry.
- [record-cash-receipt.ts](record-cash-receipt.ts): Records actual collected cash with durable request identity.
- [stripe-checkout.ts](stripe-checkout.ts): Checkout intents, verified provider inbox and settlement reconciliation.
- [stripe-refund.ts](stripe-refund.ts): Executes authorized original-source refunds with durable intent.

## Related paths and checks

- Storage: `payments.ts`, `online-payments.ts`, `refunds-payouts.ts` and audit/request records.
- Checks: unit `receipt-corrections.test.ts`, `stripe-adapter.test.ts`, `stripe-currency.test.ts`, `order-payment-status-api.test.ts`; integration `stripe-lifecycle.test.ts`.
- Stripe entry points: `/api/v1/payments/checkout`, `/api/payments/stripe/webhook`, `/api/v1/admin/refunds/stripe`. Amount/source are backend-derived. Terminal expiry only releases qualifying unchanged card-only unpaid orders; uncertain refunds retain the same intent. Receiving-account reassignment remains unsupported.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../../docs/transaction-contracts.md)
