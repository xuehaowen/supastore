# Money calculations

Integer minor-unit calculations, display-reference search, and payment statuses.

## When working here

Respect currency precision and component caps. Do not use floating-point currency arithmetic or infer payment from a display reference.

## Where to start

- [calculations.ts](calculations.ts): Integer minor-unit price and refund calculations.
- [display-reference.ts](display-reference.ts): Normalizes typed and pasted `ORD` and `PAY` numbers for search. PostgreSQL allocates these numbers through migration `0051_commerce_references`.
- [order-payment-state.ts](order-payment-state.ts): Classifies order funding and settled refunds independently of lifecycle status.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../../../docs/transaction-contracts.md)
