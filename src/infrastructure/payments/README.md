# Payment adapters

Stripe transport and typed payment-adapter selection.

## When working here

Amounts and original sources come from backend workflows. Validate supported provider currency units before network calls.

## Where to start

- [payment-adapters.ts](payment-adapters.ts): Selects registered payment transports.
- [stripe.ts](stripe.ts): Stripe network transport and provider result normalization.

## More context

[Parent overview](../README.md)
